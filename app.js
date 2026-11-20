/**
 * 三欄看板式待辦事項清單 (Kanban Task Management)
 * 欄位：To-do (todo) / Process (process) / Done (done)
 * 優先程度：High (high) / Medium (medium) / Low (low) — 各欄位自動依優先程度排序
 * 功能：跨欄位拖曳 (Drag & Drop)、新增任務、負責人、工作/生活分類、優先程度設定、行內編輯、本地儲存 (localStorage)
 */

const STORAGE_KEY = "chingfeng_todos_v1";

const CATEGORY_LABELS = {
  work: "工作",
  life: "生活",
};

const PRIORITY_LABELS = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const PRIORITY_WEIGHTS = {
  high: 1,
  medium: 2,
  low: 3,
};

const VALID_STATUSES = ["todo", "process", "done"];
const VALID_PRIORITIES = ["high", "medium", "low"];

// 應用程式狀態
let todos = [];
let currentFilter = "all"; // 'all' | 'work' | 'life'
let editingId = null;
let draggedId = null;

// DOM 元素參照
const todoForm = document.getElementById("todo-form");
const todoInput = document.getElementById("todo-input");
const todoAssignee = document.getElementById("todo-assignee");
const todoCategory = document.getElementById("todo-category");
const todoPriority = document.getElementById("todo-priority");

const listTodoEl = document.getElementById("list-todo");
const listProcessEl = document.getElementById("list-process");
const listDoneEl = document.getElementById("list-done");

const colCountTodoEl = document.getElementById("col-count-todo");
const colCountProcessEl = document.getElementById("col-count-process");
const colCountDoneEl = document.getElementById("col-count-done");

const pendingCountEl = document.getElementById("pending-count");
const countAllEl = document.getElementById("count-all");
const countWorkEl = document.getElementById("count-work");
const countLifeEl = document.getElementById("count-life");
const footerSummaryEl = document.getElementById("footer-summary");
const clearCompletedBtn = document.getElementById("clear-completed-btn");
const filterTabs = document.querySelectorAll(".filter-tab");
const kanbanColumns = document.querySelectorAll(".kanban-column");

const COLUMN_CONTAINERS = {
  todo: listTodoEl,
  process: listProcessEl,
  done: listDoneEl,
};

const EMPTY_HINTS = {
  todo: "將卡片拖曳至此，或由上方新增待辦任務",
  process: "將正在執行的任務卡片拖曳至此欄位",
  done: "將已完成的任務卡片拖曳至此欄位",
};

/**
 * 依優先程度 (High -> Medium -> Low) 進行穩定排序
 */
function sortTodosByPriority() {
  todos.sort((a, b) => {
    const weightA = PRIORITY_WEIGHTS[a.priority] || 2;
    const weightB = PRIORITY_WEIGHTS[b.priority] || 2;
    return weightA - weightB;
  });
}

/**
 * 從 localStorage 載入待辦資料（相容舊版結構）
 */
function loadTodos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      todos = [];
      return;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      todos = parsed.map((item) => {
        let status = item.status;
        if (!VALID_STATUSES.includes(status)) {
          status = item.completed ? "done" : "todo";
        }
        const priority = VALID_PRIORITIES.includes(item.priority)
          ? item.priority
          : "medium";

        return {
          id: String(item.id || Date.now()),
          text: String(item.text || "").trim(),
          assignee: String(item.assignee || "").trim(),
          category: item.category === "life" ? "life" : "work",
          priority,
          status,
          completed: status === "done",
          createdAt: Number(item.createdAt) || Date.now(),
        };
      });
      sortTodosByPriority();
    } else {
      todos = [];
    }
  } catch (err) {
    console.error("讀取本地儲存資料失敗：", err);
    todos = [];
  }
}

/**
 * 將待辦資料寫入 localStorage
 */
function saveTodos() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch (err) {
    console.error("寫入本地儲存資料失敗：", err);
  }
}

/**
 * 產生唯一 ID
 */
function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `todo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 新增任務（預設進入 To-do 欄位，並依優先程度排序）
 */
function addTodo(text, assignee, category, priority) {
  const trimmedText = text.trim();
  if (!trimmedText) return;

  const validPriority = VALID_PRIORITIES.includes(priority) ? priority : "medium";

  const newTodo = {
    id: generateId(),
    text: trimmedText,
    assignee: assignee.trim(),
    category: category === "life" ? "life" : "work",
    priority: validPriority,
    status: "todo",
    completed: false,
    createdAt: Date.now(),
  };

  todos.unshift(newTodo);
  sortTodosByPriority();
  saveTodos();
  render();
}

/**
 * 刪除單筆任務
 */
function deleteTodo(id) {
  todos = todos.filter((t) => t.id !== id);
  if (editingId === id) {
    editingId = null;
  }
  saveTodos();
  render();
}

/**
 * 進入行內編輯模式
 */
function startEdit(id) {
  editingId = id;
  render();
}

/**
 * 取消行內編輯
 */
function cancelEdit() {
  editingId = null;
  render();
}

/**
 * 儲存編輯後的任務內容、負責人、分類與優先程度
 */
function saveEdit(id, newText, newAssignee, newCategory, newPriority) {
  const trimmedText = newText.trim();
  if (!trimmedText) return;

  const target = todos.find((t) => t.id === id);
  if (!target) return;

  target.text = trimmedText;
  target.assignee = newAssignee.trim();
  target.category = newCategory === "life" ? "life" : "work";
  target.priority = VALID_PRIORITIES.includes(newPriority)
    ? newPriority
    : "medium";
  editingId = null;

  sortTodosByPriority();
  saveTodos();
  render();
}

/**
 * 移動任務至指定欄位（在同優先程度內可調整順序，整體維持 High -> Medium -> Low 排序）
 */
function moveTask(taskId, targetStatus, beforeTaskId = null) {
  if (!VALID_STATUSES.includes(targetStatus)) return;

  const taskIndex = todos.findIndex((t) => t.id === taskId);
  if (taskIndex === -1) return;

  const [movedTask] = todos.splice(taskIndex, 1);
  movedTask.status = targetStatus;
  movedTask.completed = targetStatus === "done";

  if (beforeTaskId && beforeTaskId !== taskId) {
    const targetIndex = todos.findIndex((t) => t.id === beforeTaskId);
    if (targetIndex !== -1) {
      todos.splice(targetIndex, 0, movedTask);
    } else {
      todos.push(movedTask);
    }
  } else {
    todos.push(movedTask);
  }

  sortTodosByPriority();
  saveTodos();
  render();
}

/**
 * 一鍵清除所有 Done 項目
 */
function clearCompleted() {
  const hasDone = todos.some((t) => t.status === "done");
  if (!hasDone) return;

  todos = todos.filter((t) => t.status !== "done");
  if (editingId && !todos.some((t) => t.id === editingId)) {
    editingId = null;
  }
  saveTodos();
  render();
}

/**
 * 切換分類篩選器
 */
function setFilter(filter) {
  currentFilter = filter;
  filterTabs.forEach((tab) => {
    const isMatch = tab.dataset.filter === filter;
    tab.classList.toggle("active", isMatch);
    tab.setAttribute("aria-selected", isMatch ? "true" : "false");
  });
  render();
}

/**
 * 更新頂部、篩選頁籤與底部統計數據
 */
function updateStats(filteredTodos) {
  const totalCount = todos.length;
  const todoCountAll = todos.filter((t) => t.status === "todo").length;
  const processCountAll = todos.filter((t) => t.status === "process").length;
  const doneCountAll = todos.filter((t) => t.status === "done").length;
  const pendingCount = todoCountAll + processCountAll;

  const workCount = todos.filter((t) => t.category === "work").length;
  const lifeCount = todos.filter((t) => t.category === "life").length;

  pendingCountEl.textContent = String(pendingCount);
  countAllEl.textContent = String(totalCount);
  countWorkEl.textContent = String(workCount);
  countLifeEl.textContent = String(lifeCount);

  colCountTodoEl.textContent = String(
    filteredTodos.filter((t) => t.status === "todo").length
  );
  colCountProcessEl.textContent = String(
    filteredTodos.filter((t) => t.status === "process").length
  );
  colCountDoneEl.textContent = String(
    filteredTodos.filter((t) => t.status === "done").length
  );

  footerSummaryEl.textContent = `To-do: ${todoCountAll} ｜ Process: ${processCountAll} ｜ Done: ${doneCountAll}（共 ${totalCount} 項）`;
  clearCompletedBtn.disabled = doneCountAll === 0;
}

/**
 * 建立單一任務卡片 DOM
 */
function createTaskCard(todo) {
  const card = document.createElement("article");
  card.className = `task-card category-card-${todo.category} status-${todo.status} priority-card-${todo.priority}`;
  card.dataset.id = todo.id;
  card.dataset.status = todo.status;
  card.dataset.priority = todo.priority;

  // 若正在編輯中，渲染卡片內編輯表單（不啟用拖曳）
  if (editingId === todo.id) {
    card.draggable = false;

    const editForm = document.createElement("div");
    editForm.className = "card-edit-form";

    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.className = "form-control edit-input";
    textInput.value = todo.text;
    textInput.placeholder = "任務內容";
    textInput.maxLength = 120;

    const splitRow = document.createElement("div");
    splitRow.className = "edit-row-split";

    const assigneeInput = document.createElement("input");
    assigneeInput.type = "text";
    assigneeInput.className = "form-control edit-input";
    assigneeInput.value = todo.assignee || "";
    assigneeInput.placeholder = "負責人";
    assigneeInput.maxLength = 30;

    const categorySelect = document.createElement("select");
    categorySelect.className = "form-control edit-input";
    ["work", "life"].forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = CATEGORY_LABELS[cat];
      if (todo.category === cat) opt.selected = true;
      categorySelect.appendChild(opt);
    });

    const prioritySelect = document.createElement("select");
    prioritySelect.className = "form-control edit-input";
    VALID_PRIORITIES.forEach((prio) => {
      const opt = document.createElement("option");
      opt.value = prio;
      opt.textContent = PRIORITY_LABELS[prio];
      if (todo.priority === prio) opt.selected = true;
      prioritySelect.appendChild(opt);
    });

    splitRow.appendChild(assigneeInput);
    splitRow.appendChild(categorySelect);
    splitRow.appendChild(prioritySelect);

    const editActions = document.createElement("div");
    editActions.className = "edit-actions";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn btn-sm btn-save";
    saveBtn.textContent = "儲存";
    saveBtn.addEventListener("click", () => {
      saveEdit(
        todo.id,
        textInput.value,
        assigneeInput.value,
        categorySelect.value,
        prioritySelect.value
      );
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn-sm btn-cancel";
    cancelBtn.textContent = "取消";
    cancelBtn.addEventListener("click", cancelEdit);

    const handleKeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveEdit(
          todo.id,
          textInput.value,
          assigneeInput.value,
          categorySelect.value,
          prioritySelect.value
        );
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelEdit();
      }
    };
    textInput.addEventListener("keydown", handleKeydown);
    assigneeInput.addEventListener("keydown", handleKeydown);
    categorySelect.addEventListener("keydown", handleKeydown);
    prioritySelect.addEventListener("keydown", handleKeydown);

    editActions.appendChild(saveBtn);
    editActions.appendChild(cancelBtn);

    editForm.appendChild(textInput);
    editForm.appendChild(splitRow);
    editForm.appendChild(editActions);
    card.appendChild(editForm);

    requestAnimationFrame(() => {
      textInput.focus();
      textInput.setSelectionRange(textInput.value.length, textInput.value.length);
    });

    return card;
  }

  // 一般檢視模式：啟用 HTML5 拖曳
  card.draggable = true;

  card.addEventListener("dragstart", (e) => {
    draggedId = todo.id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", todo.id);
    requestAnimationFrame(() => {
      card.classList.add("dragging");
    });
  });

  card.addEventListener("dragend", () => {
    draggedId = null;
    card.classList.remove("dragging");
    kanbanColumns.forEach((col) => col.classList.remove("drag-over"));
  });

  // 卡片頂部：分類標籤 + 優先程度標籤 + 編輯/刪除
  const topRow = document.createElement("div");
  topRow.className = "card-top";

  const badgesGroup = document.createElement("div");
  badgesGroup.className = "card-badges";

  const categoryBadge = document.createElement("span");
  categoryBadge.className = `category-badge category-${todo.category}`;
  categoryBadge.textContent = CATEGORY_LABELS[todo.category] || "工作";

  const priorityBadge = document.createElement("span");
  const prioKey = VALID_PRIORITIES.includes(todo.priority)
    ? todo.priority
    : "medium";
  priorityBadge.className = `priority-badge priority-${prioKey}`;
  priorityBadge.textContent = PRIORITY_LABELS[prioKey];

  badgesGroup.appendChild(categoryBadge);
  badgesGroup.appendChild(priorityBadge);

  const actionsDiv = document.createElement("div");
  actionsDiv.className = "card-actions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "action-btn edit-btn";
  editBtn.textContent = "編輯";
  editBtn.setAttribute("aria-label", `編輯「${todo.text}」`);
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    startEdit(todo.id);
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "action-btn delete-btn";
  deleteBtn.textContent = "刪除";
  deleteBtn.setAttribute("aria-label", `刪除「${todo.text}」`);
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteTodo(todo.id);
  });

  actionsDiv.appendChild(editBtn);
  actionsDiv.appendChild(deleteBtn);

  topRow.appendChild(badgesGroup);
  topRow.appendChild(actionsDiv);

  // 卡片中間：任務文字
  const textP = document.createElement("p");
  textP.className = "card-text";
  textP.textContent = todo.text;

  // 卡片底部：負責人徽章 + 拖曳手把符號
  const bottomRow = document.createElement("div");
  bottomRow.className = "card-bottom";

  const assigneeBadge = document.createElement("span");
  assigneeBadge.className = "assignee-badge";
  assigneeBadge.textContent = todo.assignee ? todo.assignee : "未指派";

  const gripSpan = document.createElement("span");
  gripSpan.className = "drag-grip";
  gripSpan.title = "按住拖曳以移動欄位";
  gripSpan.setAttribute("aria-hidden", "true");
  gripSpan.textContent = "⋮⋮";

  bottomRow.appendChild(assigneeBadge);
  bottomRow.appendChild(gripSpan);

  card.appendChild(topRow);
  card.appendChild(textP);
  card.appendChild(bottomRow);

  return card;
}

/**
 * 計算拖曳時滑鼠下方最接近的目標卡片，以便精準插入排序
 */
function getDragAfterElement(container, y) {
  const draggableElements = [
    ...container.querySelectorAll(".task-card:not(.dragging)"),
  ];

  return draggableElements.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

/**
 * 綁定三個看板欄位的拖放事件 (Dropzones)
 */
function setupDropzones() {
  kanbanColumns.forEach((column) => {
    const targetStatus = column.dataset.status;
    const bodyEl = column.querySelector(".column-body");

    column.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      column.classList.add("drag-over");

      const draggingCard = document.querySelector(".task-card.dragging");
      if (!draggingCard) return;

      const emptyPlaceholder = bodyEl.querySelector(".column-empty");
      if (emptyPlaceholder) {
        emptyPlaceholder.style.display = "none";
      }

      const afterElement = getDragAfterElement(bodyEl, e.clientY);
      if (!afterElement) {
        bodyEl.appendChild(draggingCard);
      } else {
        bodyEl.insertBefore(draggingCard, afterElement);
      }
    });

    column.addEventListener("dragleave", (e) => {
      if (!column.contains(e.relatedTarget)) {
        column.classList.remove("drag-over");
      }
    });

    column.addEventListener("drop", (e) => {
      e.preventDefault();
      column.classList.remove("drag-over");

      const taskId = draggedId || e.dataTransfer.getData("text/plain");
      if (!taskId) return;

      const afterElement = getDragAfterElement(bodyEl, e.clientY);
      const beforeTaskId = afterElement ? afterElement.dataset.id : null;

      moveTask(taskId, targetStatus, beforeTaskId);
    });
  });
}

/**
 * 渲染整個三欄看板（各欄位內依 High -> Medium -> Low 排序）
 */
function render() {
  sortTodosByPriority();

  const filteredTodos =
    currentFilter === "all"
      ? todos
      : todos.filter((t) => t.category === currentFilter);

  updateStats(filteredTodos);

  VALID_STATUSES.forEach((status) => {
    const container = COLUMN_CONTAINERS[status];
    container.innerHTML = "";

    const columnItems = filteredTodos.filter((t) => t.status === status);

    if (columnItems.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "column-empty";
      emptyDiv.textContent = EMPTY_HINTS[status];
      container.appendChild(emptyDiv);
      return;
    }

    const fragment = document.createDocumentFragment();
    columnItems.forEach((todo) => {
      fragment.appendChild(createTaskCard(todo));
    });
    container.appendChild(fragment);
  });
}

// 綁定表單與按鈕事件
todoForm.addEventListener("submit", (e) => {
  e.preventDefault();
  addTodo(
    todoInput.value,
    todoAssignee.value,
    todoCategory.value,
    todoPriority.value
  );
  todoInput.value = "";
  todoAssignee.value = "";
  todoPriority.value = "medium";
  todoInput.focus();
});

filterTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    setFilter(tab.dataset.filter);
  });
});

clearCompletedBtn.addEventListener("click", clearCompleted);

// 初始化啟動
loadTodos();
setupDropzones();
render();
