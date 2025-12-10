const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

// Data structure: { id, content, days: [bool, bool...7], children: [] }
// Days mapping: 0: Sat, 1: Sun, ... 6: Fri
const savedData = JSON.parse(localStorage.getItem('weekPlan')) || {};
let tasks = Array.isArray(savedData) ? savedData : (savedData.tasks || []);
let weekDates = Array.isArray(savedData) ? { start: '', end: '' } : (savedData.dates || { start: '', end: '' });

const saveTasks = () => {
    localStorage.setItem('weekPlan', JSON.stringify({
        tasks: tasks,
        dates: weekDates
    }));
};

const updateTaskInTree = (taskList, taskId, action, payload = null) => {
    return taskList.reduce((acc, task) => {
        if (action === 'RESET_WEEK') {
            // Reset all days to false for this task, and recurse for children
            const resetChildren = updateTaskInTree(task.children || [], taskId, action, payload);
            return [...acc, {
                ...task,
                days: [false, false, false, false, false, false, false],
                children: resetChildren
            }];
        }

        if (task.id === taskId) {
            switch (action) {
                case 'TOGGLE_DAY':
                    // payload is dayIndex
                    const newDays = [...(task.days || [false, false, false, false, false, false, false])];
                    newDays[payload] = !newDays[payload];
                    return [...acc, { ...task, days: newDays }];
                case 'EDIT_CONTENT':
                    return [...acc, { ...task, content: payload }];
                case 'ADD_CHILD':
                    return [...acc, {
                        ...task,
                        children: [...(task.children || []), {
                            id: generateId(),
                            content: payload,
                            days: [false, false, false, false, false, false, false],
                            children: []
                        }]
                    }];
                case 'DELETE':
                    return acc;
                default:
                    return [...acc, task];
            }
        } else if (task.children && task.children.length > 0) {
            const updatedChildren = updateTaskInTree(task.children, taskId, action, payload);
            return [...acc, { ...task, children: updatedChildren }];
        }
        return [...acc, task];
    }, []);
};

// Calculate Progress
const updateProgress = () => {
    let totalChecks = 0;
    let completedChecks = 0;

    const countTask = (t) => {
        // Only count if it's NOT a parent header (leaf nodes or subtasks)
        if (!t.children || t.children.length === 0) {
            // Count standard days (7). 
            // Optional: Count only VALID days in range if we want precision, but total 7 is simple denominator.
            // Let's stick to 7 for simplicity or check out-of-range logic if preferred. 
            // Considering simplicity of "Weekly Plan", 7 is fine or count enabled ones.

            // To be accurate with the "Out of Range" feature, we should count only enabled days.
            let validDaysCount = 7;
            if (weekDates.start && weekDates.end) {
                const start = new Date(weekDates.start);
                const end = new Date(weekDates.end);
                start.setHours(0, 0, 0, 0);
                end.setHours(0, 0, 0, 0);
                const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
                validDaysCount = Math.min(7, diffDays + 1);
            }

            totalChecks += validDaysCount;

            const days = t.days || [];
            // Count checked days that are largely within validity (index < validDaysCount)
            for (let i = 0; i < validDaysCount; i++) {
                if (days[i]) completedChecks++;
            }
        }
        if (t.children) t.children.forEach(countTask);
    };

    tasks.forEach(countTask);

    const scoreElement = document.getElementById('progress-score');
    if (totalChecks === 0) {
        scoreElement.textContent = '0%';
    } else {
        const percentage = Math.round((completedChecks / totalChecks) * 100);
        scoreElement.textContent = `${percentage}%`;
    }
};

const resetWeek = () => {
    if (confirm('هل تريد مسح جميع علامات الإنجاز لبدء أسبوع جديد؟')) {
        tasks = updateTaskInTree(tasks, null, 'RESET_WEEK');
        saveAndRender();
    }
};

const deleteTask = (id) => {
    tasks = updateTaskInTree(tasks, id, 'DELETE');
    saveAndRender();
};

const toggleTaskDay = (id, dayIndex) => {
    tasks = updateTaskInTree(tasks, id, 'TOGGLE_DAY', dayIndex);
    // saveTasks(); // Checkbox change doesn't always need full re-render, but for simplicity
    saveTasks(); // We won't re-render entire list to keep focus, relying on browser state for visual, but saving is key.
    updateProgress(); // Just update score
};

const editTask = (id, newContent) => {
    tasks = updateTaskInTree(tasks, id, 'EDIT_CONTENT', newContent);
    saveTasks();
};

const addSubtask = (parentId, content) => {
    tasks = updateTaskInTree(tasks, parentId, 'ADD_CHILD', content);
    saveAndRender();
};

const addTask = (content) => {
    tasks.push({
        id: generateId(),
        content: content,
        days: [false, false, false, false, false, false, false], // Sat -> Fri
        children: []
    });
    saveAndRender();
};

const renderTask = (task, isChild = false) => {
    const li = document.createElement('div');
    li.className = `task-wrapper ${isChild ? 'child' : ''}`;

    // Ensure days array exists
    const days = task.days || [false, false, false, false, false, false, false];

    // Check if task has children
    const hasChildren = task.children && task.children.length > 0;

    // Create 7 checkboxes HTML
    const checkboxesHtml = days.map((done, index) => {
        if (hasChildren) {
            return `<div class="day-col parent-cell"></div>`;
        }

        let disabledClass = '';
        if (weekDates.start && weekDates.end) {
            const start = new Date(weekDates.start);
            const end = new Date(weekDates.end);
            start.setHours(0, 0, 0, 0);
            end.setHours(0, 0, 0, 0);

            const diffTime = end - start;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (index > diffDays) {
                disabledClass = 'out-of-range';
            }
        }

        return `
        <div class="day-col ${disabledClass}">
            <input type="checkbox" class="day-checkbox" data-day="${index}" ${done ? 'checked' : ''} ${disabledClass ? 'disabled' : ''}>
        </div>
    `}).join('');

    li.innerHTML = `
        <div class="task-item ${hasChildren ? 'is-parent-header' : ''}" id="task-${task.id}">
            <div class="task-col">
                <button class="action-btn delete" title="حذف">x</button>
                <button class="action-btn add-sub" title="إضافة فرعي">+</button>
                <input type="text" class="task-content" value="${task.content}" aria-label="Task content">
            </div>
            ${checkboxesHtml}
        </div>
        <div class="subtasks-container" id="subs-${task.id}"></div>
    `;

    // Events
    const contentInput = li.querySelector('.task-content');
    contentInput.addEventListener('change', (e) => editTask(task.id, e.target.value));

    // Delete
    const deleteBtn = li.querySelector('.delete');
    deleteBtn.addEventListener('click', () => deleteTask(task.id));

    // Add Sub
    const addSubBtn = li.querySelector('.add-sub');
    addSubBtn.addEventListener('click', () => {
        const subContent = prompt('اكتب المهمة الفرعية:');
        if (subContent && subContent.trim()) {
            addSubtask(task.id, subContent.trim());
        }
    });

    // Day Checks
    const dayChecks = li.querySelectorAll('.day-checkbox');
    dayChecks.forEach(box => {
        box.addEventListener('change', (e) => {
            const index = parseInt(e.target.getAttribute('data-day'));
            toggleTaskDay(task.id, index);
        });
    });

    // Recursion
    const subContainer = li.querySelector('.subtasks-container');
    if (task.children && task.children.length > 0) {
        task.children.forEach(child => {
            subContainer.appendChild(renderTask(child, true));
        });
    }

    return li;
};

const render = () => {
    const list = document.getElementById('task-list');
    const emptyState = document.getElementById('empty-state');

    list.innerHTML = '';

    if (tasks.length === 0) {
        emptyState.style.display = 'block';
    } else {
        emptyState.style.display = 'none';
        tasks.forEach(task => {
            list.appendChild(renderTask(task));
        });
    }
};

const saveAndRender = () => {
    saveTasks();
    render();
    updateProgress();
};

document.addEventListener('DOMContentLoaded', () => {
    render();
    updateProgress();

    const addBtn = document.getElementById('add-task-btn');
    const input = document.getElementById('new-task-input');

    const handleAdd = () => {
        const value = input.value.trim();
        if (value) {
            addTask(value);
            input.value = '';
            input.focus();
        }
    };

    addBtn.addEventListener('click', handleAdd);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAdd();
    });

    const startInput = document.getElementById('week-start');
    const endInput = document.getElementById('week-end');

    // Helper to format date as YYYY-MM-DD
    const formatDate = (date) => date.toISOString().split('T')[0];

    // Helper to add days
    const addDays = (dateStr, days) => {
        const date = new Date(dateStr);
        date.setDate(date.getDate() + days);
        return formatDate(date);
    };

    // Helper to update grid headers based on start day
    const updateGridHeaders = (startDateStr) => {
        if (!startDateStr) return;

        const date = new Date(startDateStr);
        const daysAR = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
        const headerCells = document.querySelectorAll('.header-cell.day-header');

        // Adjust array so it starts from the selected day
        const startDayIndex = date.getDay(); // 0 is Sunday

        headerCells.forEach((cell, index) => {
            // (startDayIndex + index) % 7 handles rotation
            const dayName = daysAR[(startDayIndex + index) % 7];
            cell.textContent = dayName;
        });
    };

    // Initial Load
    if (weekDates.start) {
        startInput.value = weekDates.start;
        // Enforce end date calculation on load or use saved
        if (weekDates.start && !weekDates.end) {
            weekDates.end = addDays(weekDates.start, 6);
        }
        endInput.value = weekDates.end;
        updateGridHeaders(weekDates.start);
    }

    startInput.addEventListener('change', (e) => {
        const newVal = e.target.value;
        if (newVal) {
            weekDates.start = newVal;
            // Auto set end date to start + 6 days (total 7 days)
            weekDates.end = addDays(newVal, 6);
            endInput.value = weekDates.end;

            updateGridHeaders(newVal);
            saveAndRender(); // Changed to full render to update score range calc
        }
    });

    endInput.addEventListener('change', (e) => {
        // Optional: Manual override allows changing end date, but standard behavior is auto.
        // We'll keep it flexible, but user asked for default behavior.
        weekDates.end = e.target.value;
        saveAndRender(); // Changed to full render
    });

    document.getElementById('reset-week-btn').addEventListener('click', resetWeek);
    document.getElementById('print-btn').addEventListener('click', () => {
        window.print();
    });
});
