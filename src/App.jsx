import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY_V1 = "focusflow:data:v1";
const STORAGE_KEY_V2 = "focusflow:data:v2";
const SETTINGS_KEY_V1 = "focusflow:dailySettings:v1";
const SETTINGS_KEY_V2 = "focusflow:dailySettings:v2";

const COLUMNS = [
  {
    id: "later",
    title: "Later",
    wrap: "border-2 border-[#F9E89A] bg-[#FFFDE7] shadow-sm",
  },
  {
    id: "focus",
    title: "Focus",
    wrap: "border-2 border-[#F9A8C0] bg-[#FCE4EC] shadow-sm",
  },
  {
    id: "done",
    title: "Done",
    wrap: "border-2 border-[#A5D6A7] bg-[#E8F5E9] shadow-sm",
  },
];

const SIZE_META = {
  large: { short: "🔴 대형", hours: 2 },
  medium: { short: "🟡 중형", hours: 1 },
  small: { short: "🟢 소형", hours: 0.5 },
};

const SIZE_PICKER_OPTIONS = [
  { id: "small", label: "🟢 소형 (30분 이하)" },
  { id: "medium", label: "🟡 중형 (30분~2시간)" },
  { id: "large", label: "🔴 대형 (2시간+)" },
];

function sizePickerButtonClass(isSelected, sizeId) {
  const base =
    "rounded-[20px] border-2 px-3 py-2 text-left text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F43F5E]/40";
  if (!isSelected) {
    return `${base} border-[#eee] bg-[#f9f9f9] text-[#aaa] hover:bg-[#f3f3f3]`;
  }
  if (sizeId === "small") {
    return `${base} border-[#15803D] bg-[#DCFCE7] text-[#15803D]`;
  }
  if (sizeId === "medium") {
    return `${base} border-[#A16207] bg-[#FEF9C3] text-[#A16207]`;
  }
  return `${base} border-[#BE123C] bg-[#FFE4E6] text-[#BE123C]`;
}

function SizeTag({ size }) {
  const map = {
    small: "bg-[#DCFCE7] text-[#15803D]",
    medium: "bg-[#FEF9C3] text-[#A16207]",
    large: "bg-[#FFE4E6] text-[#BE123C]",
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${map[size] ?? map.medium}`}>
      {SIZE_META[size]?.short ?? size}
    </span>
  );
}

/** 열 이동 (Later→Focus, Focus→Later·Done, Done→Focus) — 작은 pill */
const COLUMN_MOVE_PILL =
  "rounded-md border border-[#e0e0e0] bg-[#fafafa] px-2 py-0.5 text-[11px] font-medium text-[#555] transition hover:border-[#ccc] hover:bg-[#f0f0f0]";

function ColumnMoveButtonGroup({ status, onSelect }) {
  return (
    <>
      {status === "later" && (
        <>
          <button type="button" className={COLUMN_MOVE_PILL} onClick={() => onSelect("focus")}>
            Focus
          </button>
          <button type="button" className={COLUMN_MOVE_PILL} onClick={() => onSelect("done")}>
            Done
          </button>
        </>
      )}
      {status === "focus" && (
        <>
          <button type="button" className={COLUMN_MOVE_PILL} onClick={() => onSelect("later")}>
            Later
          </button>
          <button type="button" className={COLUMN_MOVE_PILL} onClick={() => onSelect("done")}>
            Done
          </button>
        </>
      )}
      {status === "done" && (
        <>
          <button type="button" className={COLUMN_MOVE_PILL} onClick={() => onSelect("later")}>
            Later
          </button>
          <button type="button" className={COLUMN_MOVE_PILL} onClick={() => onSelect("focus")}>
            Focus
          </button>
        </>
      )}
    </>
  );
}

function ColumnMoveButtons({ status, onSelect }) {
  return (
    <div
      className="mt-2 flex flex-wrap gap-1 border-t border-[#f0f0f0] pt-2"
      onClick={(e) => e.stopPropagation()}
    >
      <ColumnMoveButtonGroup status={status} onSelect={onSelect} />
    </div>
  );
}

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function getLocalDateString(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateKey(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDaysToDateKey(dateKey, deltaDays) {
  const dt = parseDateKey(dateKey);
  dt.setDate(dt.getDate() + deltaDays);
  return getLocalDateString(dt);
}

function normalizeSubtask(sub) {
  return {
    id: sub?.id ?? uid(),
    text: typeof sub?.text === "string" ? sub.text : "",
    done: Boolean(sub?.done),
    minutes: Number.isFinite(Number(sub?.minutes)) ? Math.max(0, Math.floor(Number(sub.minutes))) : 0,
  };
}

function normalizeTask(task, fallbackDoneDateKey = null) {
  const normalizedStatus = task?.status ?? "later";
  const doneDateKey =
    typeof task?.doneDateKey === "string" && task.doneDateKey
      ? task.doneDateKey
      : normalizedStatus === "done"
        ? fallbackDoneDateKey
        : null;

  return {
    ...task,
    status: normalizedStatus,
    doneDateKey,
    minutes: Number.isFinite(Number(task?.minutes)) ? Math.max(0, Math.floor(Number(task.minutes))) : 0,
    subtasks: Array.isArray(task?.subtasks) ? task.subtasks.map(normalizeSubtask) : [],
  };
}

function normalizeTasksByDate(tasksByDate) {
  const next = {};
  Object.entries(tasksByDate ?? {}).forEach(([dateKey, list]) => {
    if (!Array.isArray(list)) return;
    next[dateKey] = list.map((task) => normalizeTask(task, dateKey));
  });
  return next;
}

function getDaysDiff(fromDateKey, toDateKey) {
  const from = parseDateKey(fromDateKey);
  const to = parseDateKey(toDateKey);
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / 86_400_000);
}

function pruneExpiredDoneTasks(tasksByDate, todayDateKey) {
  const next = {};
  Object.entries(tasksByDate ?? {}).forEach(([dateKey, list]) => {
    if (!Array.isArray(list)) {
      next[dateKey] = list;
      return;
    }
    next[dateKey] = list.filter((task) => {
      if (task?.status !== "done") return true;
      const doneDateKey = task?.doneDateKey;
      if (!doneDateKey) return true;
      return getDaysDiff(doneDateKey, todayDateKey) < 3;
    });
  });
  return next;
}

function carryForwardIncompleteTasks(tasksByDate, todayDateKey) {
  const next = { ...tasksByDate };
  const todayList = next[todayDateKey] ?? [];
  const existingIds = new Set(todayList.map((t) => t.id));
  const toCopy = [];

  Object.entries(next).forEach(([dateKey, list]) => {
    if (dateKey === todayDateKey || !Array.isArray(list)) return;
    list.forEach((task) => {
      if (task.status === "done") return;
      if (existingIds.has(task.id)) return;
      existingIds.add(task.id);
      toCopy.push({
        ...task,
        subtasks: Array.isArray(task.subtasks)
          ? task.subtasks.map((sub) => ({ ...sub }))
          : [],
      });
    });
  });

  if (toCopy.length > 0) {
    next[todayDateKey] = [...toCopy, ...todayList];
  } else if (!next[todayDateKey]) {
    next[todayDateKey] = todayList;
  }

  return next;
}

function loadSettingsByDate() {
  try {
    const rawV2 = localStorage.getItem(SETTINGS_KEY_V2);
    if (rawV2) {
      const parsed = JSON.parse(rawV2);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const normalized = {};
        Object.entries(parsed).forEach(([dateKey, value]) => {
          if (!value || typeof value !== "object") return;
          if (value.focusMinutes != null) {
            normalized[dateKey] = { focusMinutes: Number(value.focusMinutes) || 0 };
            return;
          }
          // Backward compatibility: old data stored focusHours.
          if (value.focusHours != null) {
            normalized[dateKey] = { focusMinutes: Math.floor((Number(value.focusHours) || 0) * 60) };
          }
        });
        return normalized;
      }
    }
    const rawV1 = localStorage.getItem(SETTINGS_KEY_V1);
    if (rawV1) {
      const parsed = JSON.parse(rawV1);
      if (parsed?.date && parsed.focusHours != null) {
        return { [parsed.date]: { focusMinutes: Math.floor((Number(parsed.focusHours) || 0) * 60) } };
      }
    }
  } catch {
    /* ignore */
  }
  return {};
}

function loadTasksByDate() {
  const today = getLocalDateString();

  try {
    const rawV2 = localStorage.getItem(STORAGE_KEY_V2);
    if (rawV2) {
      const parsed = JSON.parse(rawV2);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const normalized = normalizeTasksByDate(parsed);
        const pruned = pruneExpiredDoneTasks(normalized, today);
        return carryForwardIncompleteTasks(pruned, today);
      }
    }
    const rawV1 = localStorage.getItem(STORAGE_KEY_V1);
    if (rawV1) {
      const parsed = JSON.parse(rawV1);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const normalized = normalizeTasksByDate({ [today]: parsed });
        const pruned = pruneExpiredDoneTasks(normalized, today);
        return carryForwardIncompleteTasks(pruned, today);
      }
    }
  } catch {
    /* ignore */
  }
  return carryForwardIncompleteTasks(pruneExpiredDoneTasks({}, today), today);
}

function formatDateLabel(dateKey) {
  const dt = parseDateKey(dateKey);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(dt);
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function App() {
  const [todayKey, setTodayKey] = useState(() => getLocalDateString());
  const [tasksByDate, setTasksByDate] = useState(() => loadTasksByDate());
  const [settingsByDate, setSettingsByDate] = useState(() => loadSettingsByDate());
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateString());

  const [showDailyModal, setShowDailyModal] = useState(() => {
    const s = loadSettingsByDate();
    return !s[getLocalDateString()]?.focusMinutes;
  });
  const [focusMinutesInput, setFocusMinutesInput] = useState(() => {
    const s = loadSettingsByDate();
    return String(s[getLocalDateString()]?.focusMinutes ?? "240");
  });
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskSize, setNewTaskSize] = useState("medium");
  const [newTaskMinutes, setNewTaskMinutes] = useState("0");
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [subtaskInput, setSubtaskInput] = useState("");
  const [newSubtaskMinutes, setNewSubtaskMinutes] = useState("0");
  const [editingSubtaskId, setEditingSubtaskId] = useState(null);
  const [subtaskEditValue, setSubtaskEditValue] = useState("");
  const [subtaskEditMinutes, setSubtaskEditMinutes] = useState("0");
  const [menuTaskId, setMenuTaskId] = useState(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => getLocalDateString().slice(0, 7));
  const [doneHistoryOpen, setDoneHistoryOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(tasksByDate));
  }, [tasksByDate]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY_V2, JSON.stringify(settingsByDate));
  }, [settingsByDate]);

  useEffect(() => {
    const tick = () => {
      const latestToday = getLocalDateString();
      setTodayKey(latestToday);
      setTasksByDate((prev) => {
        const pruned = pruneExpiredDoneTasks(prev, latestToday);
        return carryForwardIncompleteTasks(pruned, latestToday);
      });
    };
    tick();
    const id = setInterval(tick, 60_000);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    setEditingSubtaskId(null);
    setSubtaskEditValue("");
    setSubtaskEditMinutes("0");
    setNewSubtaskMinutes("0");
  }, [editingTaskId]);

  const tasks = tasksByDate[selectedDate] ?? [];

  const setTaskList = (updater) => {
    setTasksByDate((prev) => {
      const cur = prev[selectedDate] ?? [];
      const nextList = typeof updater === "function" ? updater(cur) : updater;
      return { ...prev, [selectedDate]: nextList };
    });
  };

  const parseMinutes = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  };

  const getTaskTotalMinutes = (task) =>
    (task.minutes ?? 0) + (task.subtasks ?? []).reduce((sum, sub) => sum + (sub.minutes ?? 0), 0);

  const focusCapacityMinutes = Number(settingsByDate[selectedDate]?.focusMinutes) || 0;

  const focusMinutesUsed = useMemo(
    () =>
      tasks
        .filter((task) => task.status === "focus")
        .reduce((sum, task) => sum + getTaskTotalMinutes(task), 0),
    [tasks]
  );

  const isOverflow = focusCapacityMinutes > 0 && focusMinutesUsed > focusCapacityMinutes;

  const sortedByPinAndRecent = (list) =>
    [...list].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.createdAt - a.createdAt;
    });

  const grouped = useMemo(() => {
    const initial = { later: [], focus: [], done: [] };
    tasks.forEach((task) => {
      if (!initial[task.status]) return;
      initial[task.status].push(task);
    });
    return {
      later: sortedByPinAndRecent(initial.later),
      focus: sortedByPinAndRecent(initial.focus),
      done: sortedByPinAndRecent(initial.done),
    };
  }, [tasks]);

  const editingTask = tasks.find((t) => t.id === editingTaskId) ?? null;

  const openDailyModal = () => {
    setFocusMinutesInput(String(settingsByDate[selectedDate]?.focusMinutes ?? "240"));
    setShowDailyModal(true);
  };

  const addTask = (event) => {
    event.preventDefault();
    const title = newTaskTitle.trim();
    if (!title) return;
    const task = {
      id: uid(),
      title,
      size: newTaskSize,
      minutes: parseMinutes(newTaskMinutes),
      status: "later",
      pinned: false,
      subtasks: [],
      createdAt: Date.now(),
    };
    setTaskList((prev) => [task, ...prev]);
    setNewTaskTitle("");
    setNewTaskSize("medium");
    setNewTaskMinutes("0");
  };

  const updateTask = (taskId, updater) => {
    setTaskList((prev) => prev.map((task) => (task.id === taskId ? updater(task) : task)));
  };

  const moveTask = (taskId, nextStatus) => {
    updateTask(taskId, (task) => ({
      ...task,
      status: nextStatus,
      doneDateKey: nextStatus === "done" ? selectedDate : null,
    }));
  };

  const deleteTask = (taskId) => {
    setTaskList((prev) => prev.filter((t) => t.id !== taskId));
    if (editingTaskId === taskId) setEditingTaskId(null);
    setMenuTaskId(null);
  };

  const togglePin = (taskId) => {
    updateTask(taskId, (task) => ({ ...task, pinned: !task.pinned }));
  };

  const addSubtask = (event) => {
    event.preventDefault();
    const text = subtaskInput.trim();
    if (!editingTask || !text) return;
    updateTask(editingTask.id, (task) => ({
      ...task,
      subtasks: [
        ...(task.subtasks ?? []),
        { id: uid(), text, done: false, minutes: parseMinutes(newSubtaskMinutes) },
      ],
    }));
    setSubtaskInput("");
    setNewSubtaskMinutes("0");
  };

  const toggleSubtask = (taskId, subtaskId) => {
    updateTask(taskId, (task) => ({
      ...task,
      subtasks: (task.subtasks ?? []).map((sub) => (sub.id === subtaskId ? { ...sub, done: !sub.done } : sub)),
    }));
  };

  const startEditSubtask = (sub) => {
    setEditingSubtaskId(sub.id);
    setSubtaskEditValue(sub.text);
    setSubtaskEditMinutes(String(sub.minutes ?? 0));
  };

  const saveSubtaskEdit = () => {
    if (!editingTask || !editingSubtaskId) return;
    const text = subtaskEditValue.trim();
    if (!text) return;
    updateTask(editingTask.id, (task) => ({
      ...task,
      subtasks: (task.subtasks ?? []).map((s) =>
        s.id === editingSubtaskId ? { ...s, text, minutes: parseMinutes(subtaskEditMinutes) } : s
      ),
    }));
    setEditingSubtaskId(null);
    setSubtaskEditValue("");
    setSubtaskEditMinutes("0");
  };

  const cancelSubtaskEdit = () => {
    setEditingSubtaskId(null);
    setSubtaskEditValue("");
    setSubtaskEditMinutes("0");
  };

  const removeSubtask = (taskId, subtaskId) => {
    updateTask(taskId, (task) => ({
      ...task,
      subtasks: (task.subtasks ?? []).filter((s) => s.id !== subtaskId),
    }));
    if (editingSubtaskId === subtaskId) {
      setEditingSubtaskId(null);
      setSubtaskEditValue("");
    }
  };

  const setDailyFocusHours = (event) => {
    event.preventDefault();
    const value = Number(focusMinutesInput);
    if (!Number.isFinite(value) || value <= 0) return;
    setSettingsByDate((prev) => ({ ...prev, [selectedDate]: { focusMinutes: Math.floor(value) } }));
    setShowDailyModal(false);
  };

  const goPrevDay = () => setSelectedDate((d) => addDaysToDateKey(d, -1));
  const goNextDay = () => setSelectedDate((d) => addDaysToDateKey(d, 1));

  const hasTasksOnDate = (dateKey) => (tasksByDate[dateKey]?.length ?? 0) > 0;

  const doneHistoryByDate = useMemo(() => {
    const groupedByDoneDate = {};
    Object.values(tasksByDate).forEach((list) => {
      if (!Array.isArray(list)) return;
      list.forEach((task) => {
        if (task.status !== "done" || !task.doneDateKey) return;
        if (!groupedByDoneDate[task.doneDateKey]) groupedByDoneDate[task.doneDateKey] = [];
        groupedByDoneDate[task.doneDateKey].push(task);
      });
    });

    Object.keys(groupedByDoneDate).forEach((dateKey) => {
      groupedByDoneDate[dateKey] = sortedByPinAndRecent(groupedByDoneDate[dateKey]);
    });

    return Object.entries(groupedByDoneDate).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [tasksByDate]);

  const openCalendar = () => {
    setCalendarMonth(selectedDate.slice(0, 7));
    setCalendarOpen(true);
  };

  const selectCalendarDate = (dateKey) => {
    setSelectedDate(dateKey);
    setCalendarOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#F4FBF4] px-4 py-8 text-[#444]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-2xl border-2 border-[#C8E6C9] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#F43F5E]">FocusFlow</h1>
              <p className="text-sm text-[#888]">오늘의 집중 에너지를 시각적으로 관리하세요.</p>
            </div>
            <button
              type="button"
              className="rounded-xl border-2 border-[#F9A8C0] bg-[#FFF5F7] px-4 py-2 text-sm font-semibold text-[#F43F5E] transition hover:bg-[#FCE4EC]"
              onClick={openDailyModal}
            >
              집중시간 설정
            </button>
            <button
              type="button"
              className="rounded-xl border-2 border-[#A5D6A7] bg-[#E8F5E9] px-4 py-2 text-sm font-semibold text-[#2E7D32] transition hover:bg-[#DCEDC8]"
              onClick={() => setDoneHistoryOpen(true)}
            >
              Done 히스토리
            </button>
          </div>

          <DateNavigator
            selectedDate={selectedDate}
            todayKey={todayKey}
            formattedLabel={formatDateLabel(selectedDate)}
            onPrev={goPrevDay}
            onNext={goNextDay}
            onPickYesterday={() => setSelectedDate(addDaysToDateKey(todayKey, -1))}
            onPickToday={() => setSelectedDate(todayKey)}
            onPickTomorrow={() => setSelectedDate(addDaysToDateKey(todayKey, 1))}
            onOpenCalendar={openCalendar}
          />

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <CardLabel title="Focus 가용 시간" value={`${focusCapacityMinutes}분`} />
            <CardLabel title="Focus 예정 시간" value={`${focusMinutesUsed}분`} />
            <CardLabel
              title="상태"
              value={isOverflow ? "초과됨 - 조정 필요" : "정상 범위"}
              danger={isOverflow}
            />
          </div>
        </header>

        <section>
          <div className="rounded-[14px] border-2 border-[#F43F5E] bg-white p-4 shadow-[0_0_0_4px_#FFE4E6] md:p-5">
            <p className="text-[13px] font-semibold text-[#F43F5E]">✏️ 여기에 할 일을 추가하세요!</p>
            <p className="mt-1 text-xs text-[#888]">선택한 날짜({selectedDate})에 추가됩니다.</p>
            <form className="mt-4" onSubmit={addTask}>
              <div className="flex flex-row items-stretch gap-3">
                <input
                  className="min-w-0 flex-1 rounded-[10px] border-2 border-[#F9A8C0] bg-[#FFF5F7] px-4 py-3 text-lg font-medium text-[#F43F5E] outline-none placeholder:text-[#FBAAB8] focus:border-[#F43F5E] focus:ring-2 focus:ring-[#F43F5E]/20"
                  placeholder="할 일을 입력하세요"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                />
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="w-28 shrink-0 rounded-[10px] border-2 border-[#F9A8C0] bg-[#FFF5F7] px-3 py-3 text-base font-medium text-[#F43F5E] outline-none placeholder:text-[#FBAAB8] focus:border-[#F43F5E] focus:ring-2 focus:ring-[#F43F5E]/20"
                  placeholder="0분"
                  value={newTaskMinutes}
                  onChange={(e) => setNewTaskMinutes(e.target.value)}
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-[10px] bg-[#F43F5E] px-8 py-3 text-lg font-semibold text-white transition hover:bg-[#e11d48]"
                >
                  Add
                </button>
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {SIZE_PICKER_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`flex-1 sm:flex-none ${sizePickerButtonClass(newTaskSize === opt.id, opt.id)}`}
                    onClick={() => setNewTaskSize(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </form>
          </div>
        </section>

        {isOverflow && (
          <div className="rounded-xl border-2 border-[#F9A8C0] bg-[#FFF5F7] px-4 py-3 text-sm font-medium text-[#F43F5E]">
            Focus 열의 예상 시간({focusMinutesUsed}분)이 이 날 가용 시간({focusCapacityMinutes}분)을 넘었습니다.
          </div>
        )}

        <section className="grid gap-4 lg:grid-cols-3">
          {COLUMNS.map((column) => (
            <div key={column.id} className={`rounded-2xl p-4 ${column.wrap}`}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-bold text-[#F43F5E]">{column.title}</h3>
                <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-semibold text-[#666]">
                  {grouped[column.id].length}
                </span>
              </div>

              {column.id === "focus" && (
                <div className="mb-3 rounded-xl border border-dashed border-[#F9A8C0] bg-white/60 p-3 text-xs text-[#666]">
                  <p className="font-semibold text-[#F43F5E]">긴급 버퍼 슬롯</p>
                  <p className="mt-1">예상치 못한 긴급 업무 1건을 위한 공간</p>
                </div>
              )}

              <div className="space-y-3">
                {grouped[column.id].map((task) => {
                  const isDoneCol = column.id === "done";
                  return (
                    <article
                      key={task.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setEditingTaskId(task.id);
                        setSubtaskInput("");
                        setMenuTaskId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setEditingTaskId(task.id);
                          setSubtaskInput("");
                          setMenuTaskId(null);
                        }
                      }}
                      className={`relative cursor-pointer rounded-xl bg-white p-3 shadow-sm transition hover:shadow-md ${
                        column.id === "focus"
                          ? "border-2 border-[#F9A8C0]"
                          : "border border-[#E8E8E8]"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p
                            className={`font-semibold ${
                              isDoneCol ? "text-[#aaa] line-through" : "text-[#F43F5E]"
                            }`}
                          >
                            {task.title}
                          </p>
                          <div className="mt-2">
                            <SizeTag size={task.size} />
                            <span className="ml-2 inline-block rounded-full bg-[#F3F4F6] px-2 py-0.5 text-xs font-semibold text-[#555]">
                              {task.minutes ?? 0}분
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-start gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className={`rounded-lg px-2 py-1 text-xs font-medium ${
                              task.pinned ? "bg-[#FFF5F7] text-[#F43F5E]" : "bg-[#f5f5f5] text-[#888]"
                            }`}
                            onClick={() => togglePin(task.id)}
                          >
                            {task.pinned ? "📌 고정" : "핀 고정"}
                          </button>
                          <div className="relative">
                            <button
                              type="button"
                              className="rounded-lg px-2 py-1 text-lg leading-none text-[#888] hover:bg-[#f5f5f5]"
                              aria-label="더보기"
                              onClick={() => setMenuTaskId((id) => (id === task.id ? null : task.id))}
                            >
                              ⋯
                            </button>
                            {menuTaskId === task.id && (
                              <div className="absolute right-0 top-full z-10 mt-1 min-w-[100px] rounded-lg border border-[#eee] bg-white py-1 shadow-lg">
                                <button
                                  type="button"
                                  className="w-full px-3 py-2 text-left text-sm text-[#e11d48] hover:bg-[#fff5f5]"
                                  onClick={() => deleteTask(task.id)}
                                >
                                  삭제
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      {column.id === "focus" && (task.subtasks?.length ?? 0) > 0 && (
                        <div className="mt-3 space-y-2">
                          {(task.subtasks ?? []).map((sub) => (
                            <div
                              key={sub.id}
                              className="ml-3 rounded-lg border-l-4 border-[#F9A8C0] bg-[#FFF5F7] px-3 py-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-start gap-2">
                                <input
                                  type="checkbox"
                                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#F43F5E]"
                                  checked={sub.done}
                                  onChange={() => toggleSubtask(task.id, sub.id)}
                                />
                                <span
                                  className={`min-w-0 flex-1 text-sm ${
                                    sub.done ? "text-[#aaa] line-through" : "text-[#444]"
                                  }`}
                                >
                                  {sub.text}
                                </span>
                                <span className="shrink-0 text-xs font-semibold text-[#F43F5E]">
                                  {sub.minutes ?? 0}분
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <ColumnMoveButtons status={task.status} onSelect={(next) => moveTask(task.id, next)} />
                    </article>
                  );
                })}

                {grouped[column.id].length === 0 && (
                  <div className="rounded-xl border border-dashed border-[#ddd] bg-white/50 p-4 text-center text-sm text-[#aaa]">
                    이 열은 비어 있어요.
                  </div>
                )}
              </div>
            </div>
          ))}
        </section>
      </div>

      {showDailyModal && (
        <ModalShell onClose={() => setShowDailyModal(false)}>
          <h2 className="text-lg font-bold text-[#F43F5E]">오늘 몇 분 집중할 수 있어?</h2>
          <p className="mt-1 text-sm text-[#888]">선택한 날짜({selectedDate}) 기준으로 저장됩니다.</p>
          <form className="mt-4 space-y-4" onSubmit={setDailyFocusHours}>
            <input
              type="number"
              min="1"
              step="1"
              className="w-full rounded-xl border-2 border-[#F9A8C0] bg-[#FFF5F7] px-4 py-2.5 outline-none focus:border-[#F43F5E]"
              value={focusMinutesInput}
              onChange={(e) => setFocusMinutesInput(e.target.value)}
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-[#F43F5E] py-3 font-semibold text-white hover:bg-[#e11d48]"
            >
              저장
            </button>
          </form>
        </ModalShell>
      )}

      {calendarOpen && (
        <ModalShell onClose={() => setCalendarOpen(false)}>
          <MiniCalendar
            month={calendarMonth}
            todayKey={todayKey}
            selectedDate={selectedDate}
            hasTasksOnDate={hasTasksOnDate}
            onPrevMonth={() =>
              setCalendarMonth((m) => {
                const [y, mo] = m.split("-").map(Number);
                const dt = new Date(y, mo - 2, 1);
                return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
              })
            }
            onNextMonth={() =>
              setCalendarMonth((m) => {
                const [y, mo] = m.split("-").map(Number);
                const dt = new Date(y, mo, 1);
                return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
              })
            }
            onSelectDate={selectCalendarDate}
          />
        </ModalShell>
      )}

      {doneHistoryOpen && (
        <ModalShell onClose={() => setDoneHistoryOpen(false)}>
          <h2 className="text-lg font-bold text-[#2E7D32]">Done 히스토리</h2>
          <p className="mt-1 text-sm text-[#888]">완료 처리된 날짜 기준으로 항목을 확인할 수 있어요.</p>
          <div className="mt-4 max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            {doneHistoryByDate.map(([dateKey, list]) => (
              <section key={dateKey} className="rounded-xl border border-[#E0E0E0] bg-[#FAFAFA] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-bold text-[#2E7D32]">{formatDateLabel(dateKey)}</p>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-[#666]">
                    {list.length}
                  </span>
                </div>
                <ul className="space-y-2">
                  {list.map((task) => (
                    <li key={task.id} className="rounded-lg border border-[#eee] bg-white px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[#444]">{task.title}</p>
                        <span className="shrink-0 text-xs font-semibold text-[#666]">{task.minutes ?? 0}분</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {doneHistoryByDate.length === 0 && (
              <div className="rounded-xl border border-dashed border-[#ddd] bg-white p-4 text-center text-sm text-[#aaa]">
                완료 히스토리가 없습니다.
              </div>
            )}
          </div>
        </ModalShell>
      )}

      {editingTask && (
        <ModalShell onClose={() => setEditingTaskId(null)}>
          <h2 className="text-lg font-bold text-[#F43F5E]">태스크 수정</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#888]">제목</label>
              <input
                className="w-full rounded-xl border-2 border-[#F9A8C0] bg-[#FFF5F7] px-4 py-2.5 font-medium text-[#F43F5E] outline-none focus:border-[#F43F5E]"
                value={editingTask.title}
                onChange={(e) => updateTask(editingTask.id, (t) => ({ ...t, title: e.target.value }))}
              />
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-[#888]">크기</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {SIZE_PICKER_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`flex-1 ${sizePickerButtonClass(editingTask.size === opt.id, opt.id)}`}
                    onClick={() => updateTask(editingTask.id, (t) => ({ ...t, size: opt.id }))}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#888]">예상 소요 시간(분)</label>
              <input
                type="number"
                min="0"
                step="1"
                className="w-full rounded-xl border-2 border-[#F9A8C0] bg-[#FFF5F7] px-4 py-2.5 font-medium text-[#F43F5E] outline-none focus:border-[#F43F5E]"
                value={String(editingTask.minutes ?? 0)}
                onChange={(e) =>
                  updateTask(editingTask.id, (t) => ({ ...t, minutes: parseMinutes(e.target.value) }))
                }
              />
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-[#888]">열</p>
              <div className="flex flex-wrap gap-2">
                {["later", "focus", "done"].map((st) => (
                  <button
                    key={st}
                    type="button"
                    className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold transition ${
                      editingTask.status === st
                        ? "border-[#F43F5E] bg-[#FFF5F7] text-[#F43F5E]"
                        : "border-[#eee] bg-[#f9f9f9] text-[#aaa]"
                    }`}
                    onClick={() => updateTask(editingTask.id, (t) => ({ ...t, status: st }))}
                  >
                    {st === "later" ? "Later" : st === "focus" ? "Focus" : "Done"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold ${
                  editingTask.pinned
                    ? "border-[#F43F5E] bg-[#FFF5F7] text-[#F43F5E]"
                    : "border-[#eee] bg-[#f9f9f9] text-[#888]"
                }`}
                onClick={() => togglePin(editingTask.id)}
              >
                {editingTask.pinned ? "📌 고정됨" : "핀 고정"}
              </button>
            </div>

            <div className="border-t border-[#eee] pt-4">
              <p className="mb-2 text-xs font-medium text-[#888]">서브태스크</p>
              <form className="flex gap-2" onSubmit={addSubtask}>
                <input
                  className="min-w-0 flex-1 rounded-xl border-2 border-[#F9A8C0] bg-[#FFF5F7] px-3 py-2 text-sm text-[#F43F5E] outline-none placeholder:text-[#FBAAB8]"
                  placeholder="서브태스크 입력"
                  value={subtaskInput}
                  onChange={(e) => setSubtaskInput(e.target.value)}
                />
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="w-20 shrink-0 rounded-xl border-2 border-[#F9A8C0] bg-[#FFF5F7] px-2 py-2 text-sm text-[#F43F5E] outline-none"
                  placeholder="0분"
                  value={newSubtaskMinutes}
                  onChange={(e) => setNewSubtaskMinutes(e.target.value)}
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-xl bg-[#F43F5E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e11d48]"
                >
                  Add
                </button>
              </form>
              <ul className="mt-3 space-y-2">
                {(editingTask.subtasks ?? []).map((sub) => (
                  <li
                    key={sub.id}
                    className="rounded-lg border border-[#eee] bg-white px-2 py-2 sm:px-3"
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#F43F5E]"
                        checked={sub.done}
                        onChange={() => toggleSubtask(editingTask.id, sub.id)}
                      />
                      {editingSubtaskId === sub.id ? (
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <input
                            className="w-full rounded-lg border-2 border-[#F9A8C0] bg-[#FFF5F7] px-2 py-1.5 text-sm text-[#F43F5E] outline-none"
                            value={subtaskEditValue}
                            onChange={(e) => setSubtaskEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                saveSubtaskEdit();
                              }
                              if (e.key === "Escape") cancelSubtaskEdit();
                            }}
                            autoFocus
                          />
                          <input
                            type="number"
                            min="0"
                            step="1"
                            className="w-full rounded-lg border-2 border-[#F9A8C0] bg-[#FFF5F7] px-2 py-1.5 text-sm text-[#F43F5E] outline-none"
                            value={subtaskEditMinutes}
                            onChange={(e) => setSubtaskEditMinutes(e.target.value)}
                          />
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              className="rounded-md bg-[#F43F5E] px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-[#e11d48]"
                              onClick={saveSubtaskEdit}
                            >
                              저장
                            </button>
                            <button
                              type="button"
                              className={`${COLUMN_MOVE_PILL} text-[11px]`}
                              onClick={cancelSubtaskEdit}
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                          <span
                            className={`min-w-0 flex-1 text-sm ${
                              sub.done ? "text-[#aaa] line-through" : "text-[#444]"
                            }`}
                          >
                            {sub.text}
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-[#F43F5E]">
                            {sub.minutes ?? 0}분
                          </span>
                        </div>
                      )}
                    </div>
                    <div
                      className="mt-2 flex flex-wrap items-center gap-1 border-t border-[#f0f0f0] pt-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ColumnMoveButtonGroup
                        status={editingTask.status}
                        onSelect={(next) =>
                          updateTask(editingTask.id, (t) => ({ ...t, status: next }))
                        }
                      />
                      {editingSubtaskId !== sub.id && (
                        <>
                          <button
                            type="button"
                            className={`${COLUMN_MOVE_PILL} text-[#F43F5E]`}
                            onClick={() => startEditSubtask(sub)}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            className={`${COLUMN_MOVE_PILL} text-[#e11d48]`}
                            onClick={() => removeSubtask(editingTask.id, sub.id)}
                          >
                            삭제
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {(editingTask.subtasks ?? []).length === 0 && (
                <p className="mt-2 text-sm text-[#aaa]">서브태스크가 없습니다.</p>
              )}
            </div>

            <button
              type="button"
              className="w-full rounded-xl border-2 border-[#fecaca] py-2.5 text-sm font-semibold text-[#e11d48] hover:bg-[#fff5f5]"
              onClick={() => deleteTask(editingTask.id)}
            >
              태스크 삭제
            </button>

            <button
              type="button"
              className="w-full rounded-xl bg-[#F43F5E] py-3 font-semibold text-white hover:bg-[#e11d48]"
              onClick={() => setEditingTaskId(null)}
            >
              닫기
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

function DateNavigator({
  selectedDate,
  todayKey,
  formattedLabel,
  onPrev,
  onNext,
  onPickYesterday,
  onPickToday,
  onPickTomorrow,
  onOpenCalendar,
}) {
  const isToday = selectedDate === todayKey;

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-[#C8E6C9] pt-4">
      <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded-xl border border-[#ddd] bg-white px-3 py-2 text-sm font-semibold text-[#666] hover:bg-[#f5f5f5]"
            onClick={onPrev}
            aria-label="이전 날"
          >
            ←
          </button>
          <button
            type="button"
            className="min-w-[200px] rounded-xl border-2 border-[#F9A8C0] bg-[#FFF5F7] px-4 py-2.5 text-center text-sm font-bold text-[#F43F5E] hover:bg-[#FCE4EC]"
            onClick={onOpenCalendar}
          >
            {formattedLabel}
            {isToday && <span className="ml-2 text-xs text-[#888]">(오늘)</span>}
          </button>
          <button
            type="button"
            className="rounded-xl border border-[#ddd] bg-white px-3 py-2 text-sm font-semibold text-[#666] hover:bg-[#f5f5f5]"
            onClick={onNext}
            aria-label="다음 날"
          >
            →
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            className="rounded-xl border border-[#ddd] bg-white px-3 py-2 text-xs font-semibold text-[#666]"
            onClick={onPickYesterday}
          >
            어제
          </button>
          <button
            type="button"
            className="rounded-xl bg-[#F43F5E] px-3 py-2 text-xs font-semibold text-white hover:bg-[#e11d48]"
            onClick={onPickToday}
          >
            오늘
          </button>
          <button
            type="button"
            className="rounded-xl border border-[#ddd] bg-white px-3 py-2 text-xs font-semibold text-[#666]"
            onClick={onPickTomorrow}
          >
            내일
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniCalendar({ month, todayKey, selectedDate, hasTasksOnDate, onPrevMonth, onNextMonth, onSelectDate }) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const lastDay = new Date(y, m, 0).getDate();
  const startWeekday = first.getDay();
  const title = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long" }).format(first);

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= lastDay; d++) cells.push(d);

  return (
    <div className="-mt-2">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" className="rounded-lg px-2 py-1 font-bold text-[#F43F5E]" onClick={onPrevMonth} aria-label="이전 달">
          ‹
        </button>
        <p className="text-sm font-bold text-[#F43F5E]">{title}</p>
        <button type="button" className="rounded-lg px-2 py-1 font-bold text-[#F43F5E]" onClick={onNextMonth} aria-label="다음 달">
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1 font-semibold text-[#aaa]">
            {w}
          </div>
        ))}
        {cells.map((d, idx) => {
          if (d == null) return <div key={`empty-${idx}`} />;
          const dateKey = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const isToday = dateKey === todayKey;
          const isSelected = dateKey === selectedDate;
          const dot = hasTasksOnDate(dateKey);

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onSelectDate(dateKey)}
              className={`relative flex min-h-10 flex-col items-center justify-center rounded-lg py-1 text-sm ${
                isSelected
                  ? "bg-[#F43F5E] font-bold text-white"
                  : isToday
                    ? "bg-[#FFF5F7] font-bold text-[#F43F5E] ring-2 ring-[#F9A8C0]"
                    : "text-[#444] hover:bg-[#f5f5f5]"
              }`}
            >
              <span>{d}</span>
              {dot && (
                <span
                  className={`mt-0.5 h-1.5 w-1.5 rounded-full ${
                    isSelected ? "bg-white" : isToday ? "bg-[#F43F5E]" : "bg-[#A5D6A7]"
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CardLabel({ title, value, danger = false }) {
  return (
    <div
      className={`rounded-xl border-2 p-3 ${
        danger ? "border-[#F9A8C0] bg-[#FFF5F7]" : "border-[#C8E6C9] bg-white"
      }`}
    >
      <p className="text-xs font-semibold text-[#F43F5E]">{title}</p>
      <p className={`mt-1 text-lg font-bold ${danger ? "text-[#F43F5E]" : "text-[#444]"}`}>{value}</p>
    </div>
  );
}

function ModalShell({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border-2 border-[#F9A8C0] bg-white p-5 shadow-xl">
        <div className="mb-2 flex justify-end">
          {onClose && (
            <button type="button" className="text-sm font-medium text-[#888] hover:text-[#F43F5E]" onClick={onClose}>
              닫기
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export default App;
