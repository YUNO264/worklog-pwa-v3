// ============================================================
// 設備別 行動記録 PWA
// 分類No.で設備と行動を紐づける版
// ============================================================

// -------------------------
// DOM
// -------------------------
const currentTime = document.getElementById("current-time");

const equipmentButtonArea = document.getElementById("equipment-button-area");
const actionButtonArea = document.getElementById("action-button-area");

const recordButton = document.getElementById("record-button");
const settingsButton = document.getElementById("settings-button");
const undoButton = document.getElementById("undo-button");
const csvButton = document.getElementById("csv-button");
const historyList = document.getElementById("history-list");

const settingsScreen = document.getElementById("settings-screen");
const settingsCloseButton = document.getElementById("settings-close-button");

const equipmentSettingsList = document.getElementById("equipment-settings-list");
const actionSettingsList = document.getElementById("action-settings-list");

const newEquipmentName = document.getElementById("new-equipment-name");
const newEquipmentGroup = document.getElementById("new-equipment-group");
const addEquipmentButton = document.getElementById("add-equipment-button");

const newActionName = document.getElementById("new-action-name");
const newActionGroup = document.getElementById("new-action-group");
const addActionButton = document.getElementById("add-action-button");

const workerNameInput = document.getElementById("worker-name");
const saveWorkerNameButton = document.getElementById("save-worker-name-button");
const workerNameStatus = document.getElementById("worker-name-status");

const recordCount = document.getElementById("record-count");
const storageUsage = document.getElementById("storage-usage");

// -------------------------
// 選択状態
// -------------------------
let selectedEquipmentName = "";
let selectedEquipmentGroup = null;
let selectedActionName = "";
let selectedActionGroup = null;

// -------------------------
// IndexedDB
// v2：設備・行動マスタにgroupを追加
// -------------------------
const DB_NAME = "EquipmentWorkLogDB";
const DB_VERSION = 2;

const LOG_STORE = "workLogs";
const EQUIPMENT_STORE = "equipments";
const ACTION_STORE = "actions";

let db = null;

// -------------------------
// 初期値
// 既存の使い方を壊さないため初期分類はすべて1
// -------------------------
const DEFAULT_EQUIPMENTS = [
    { name: "ＧＴＡ", group: 1 },
    { name: "ＴＦＡ", group: 1 },
    { name: "ＣＨＡ", group: 1 },
    { name: "旧ＣＮＡ", group: 1 },
    { name: "新ＣＮＡ", group: 1 },
    { name: "投影機＿角度あり", group: 2 },
    { name: "投影機＿角度なし", group: 2 },
    { name: "外周振れ", group: 2 },
    { name: "刃厚・バランス", group: 2 },
    { name: "粗さ計", group: 2 },
    { name: "横逃げ", group: 2 },
    { name: "顕微鏡", group: 2 },
    { name: "マイクロスコープ", group: 2 },
    { name: "作業者", group: 3 }
];

const DEFAULT_ACTIONS = [
    { name: "積込み", group: 1 },
    { name: "段取り", group: 1 },
    { name: "セット", group: 1 },
    { name: "１枚自動", group: 1 },
    { name: "全自動", group: 1 },
    { name: "手替え", group: 1 },
    { name: "補正", group: 1 },
    { name: "抜取り確認", group: 1 },
    { name: "測定＿角度", group: 2 },
    { name: "測定＿寸法", group: 2 },
    { name: "測定＿外周", group: 2 },
    { name: "測定＿左右差", group: 2 },
    { name: "移動", group: 3 },
    { name: "会議", group: 3 },
    { name: "清掃", group: 3 },
    { name: "その他", group: 3 }
];

// ============================================================
// 作業者設定
// ============================================================
const WORKER_NAME_KEY = "EquipmentWorkLogWorkerName";

function loadWorkerName() {
    const savedName = localStorage.getItem(WORKER_NAME_KEY) || "";

    workerNameInput.value = savedName;

    if (savedName === "") {
        workerNameStatus.textContent = "未設定";
    } else {
        workerNameStatus.textContent = "保存中の作業者名：" + savedName;
    }
}

saveWorkerNameButton.addEventListener("click", function () {
    const workerName = workerNameInput.value.trim();

    if (workerName === "") {
        localStorage.removeItem(WORKER_NAME_KEY);
        workerNameStatus.textContent = "未設定";
        alert("作業者名の設定を解除しました。");
        return;
    }

    localStorage.setItem(WORKER_NAME_KEY, workerName);
    workerNameStatus.textContent = "保存中の作業者名：" + workerName;

    alert("作業者名を保存しました。");
});

function getWorkerNameForFile() {
    const workerName = localStorage.getItem(WORKER_NAME_KEY) || "未設定";

    return workerName
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/\s+/g, "_")
        .trim();
}

// ============================================================
// 時計
// ============================================================
function updateClock() {
    const now = new Date();

    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");

    currentTime.textContent = `${hh}:${mm}:${ss}`;
}

updateClock();
setInterval(updateClock, 1000);

// ============================================================
// IndexedDB
// ============================================================
function openDatabase() {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = function (event) {
        const upgradeDb = event.target.result;
        const transaction = event.target.transaction;

        if (!upgradeDb.objectStoreNames.contains(LOG_STORE)) {
            const logStore = upgradeDb.createObjectStore(LOG_STORE, {
                keyPath: "id",
                autoIncrement: true
            });

            logStore.createIndex("date", "date", { unique: false });
            logStore.createIndex("timestamp", "timestamp", { unique: false });
        }

        if (!upgradeDb.objectStoreNames.contains(EQUIPMENT_STORE)) {
            upgradeDb.createObjectStore(EQUIPMENT_STORE, {
                keyPath: "id",
                autoIncrement: true
            });
        }

        if (!upgradeDb.objectStoreNames.contains(ACTION_STORE)) {
            upgradeDb.createObjectStore(ACTION_STORE, {
                keyPath: "id",
                autoIncrement: true
            });
        }

        // v1からv2へ更新する既存端末では、分類No.が無い項目を1にする
        if (event.oldVersion < 2) {
            [EQUIPMENT_STORE, ACTION_STORE].forEach(function (storeName) {
                if (!upgradeDb.objectStoreNames.contains(storeName)) {
                    return;
                }

                const store = transaction.objectStore(storeName);
                const cursorRequest = store.openCursor();

                cursorRequest.onsuccess = function (cursorEvent) {
                    const cursor = cursorEvent.target.result;

                    if (!cursor) {
                        return;
                    }

                    const item = cursor.value;

                    if (!isValidGroup(item.group)) {
                        item.group = 1;
                        cursor.update(item);
                    }

                    cursor.continue();
                };
            });
        }
    };

    request.onsuccess = function (event) {
        db = event.target.result;

        db.onversionchange = function () {
            db.close();
        };

        initializeMasterData();
        loadHistory();
    };

    request.onerror = function (event) {
        console.error("IndexedDBを開けませんでした。", event.target.error);
        alert("データベースを開けませんでした。");
    };
}

// ============================================================
// 初期マスタ
// ============================================================
async function initializeMasterData() {
    try {
        await initializeStoreIfEmpty(EQUIPMENT_STORE, DEFAULT_EQUIPMENTS);
        await initializeStoreIfEmpty(ACTION_STORE, DEFAULT_ACTIONS);

        loadEquipmentButtons();
        loadActionButtons();
    } catch (error) {
        console.error("初期設定エラー", error);
    }
}

function initializeStoreIfEmpty(storeName, items) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const countRequest = store.count();

        countRequest.onsuccess = function () {
            if (countRequest.result === 0) {
                items.forEach((item) => {
                    store.add({
                        name: item.name,
                        group: normalizeGroup(item.group)
                    });
                });
            }
        };

        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
}

// ============================================================
// 設備ボタン
// ============================================================
function loadEquipmentButtons() {
    getAllFromStore(EQUIPMENT_STORE)
        .then((equipments) => {
            equipmentButtonArea.innerHTML = "";

            equipments.forEach((equipment) => {
                const button = document.createElement("button");

                button.type = "button";
                button.className = "equipment-button";
                button.textContent = equipment.name;
                applyGroupClass(button, equipment.group);

                if (
                    equipment.name === selectedEquipmentName &&
                    normalizeGroup(equipment.group) === selectedEquipmentGroup
                ) {
                    button.classList.add("selected");
                }

                button.addEventListener("click", function () {
                    selectedEquipmentName = equipment.name;
                    selectedEquipmentGroup = normalizeGroup(equipment.group);

                    // 設備変更時は必ず行動選択を解除
                    selectedActionName = "";
                    selectedActionGroup = null;

                    document
                        .querySelectorAll(".equipment-button")
                        .forEach((btn) => btn.classList.remove("selected"));

                    button.classList.add("selected");

                    loadActionButtons();
                    updateRecordButtonState();
                });

                equipmentButtonArea.appendChild(button);
            });
        })
        .catch((error) => console.error("設備読込エラー", error));
}

// ============================================================
// 行動ボタン
// 選択設備と同じ分類No.のみ表示
// ============================================================
function loadActionButtons() {
    actionButtonArea.innerHTML = "";

    if (selectedEquipmentName === "" || selectedEquipmentGroup === null) {
        showActionGuidance("対象設備を選択してください。");
        updateRecordButtonState();
        return;
    }

    getAllFromStore(ACTION_STORE)
        .then((actions) => {
            const filteredActions = actions.filter(
                (action) => normalizeGroup(action.group) === selectedEquipmentGroup
            );

            if (filteredActions.length === 0) {
                showActionGuidance(
                    `分類No.${selectedEquipmentGroup} の行動が設定されていません。`
                );
                updateRecordButtonState();
                return;
            }

            filteredActions.forEach((action) => {
                const button = document.createElement("button");

                button.type = "button";
                button.className = "action-button";
                button.textContent = action.name;
                applyGroupClass(button, action.group);

                if (
                    action.name === selectedActionName &&
                    normalizeGroup(action.group) === selectedActionGroup
                ) {
                    button.classList.add("selected");
                }

                button.addEventListener("click", function () {
                    selectedActionName = action.name;
                    selectedActionGroup = normalizeGroup(action.group);

                    document
                        .querySelectorAll(".action-button")
                        .forEach((btn) => btn.classList.remove("selected"));

                    button.classList.add("selected");

                    updateRecordButtonState();
                });

                actionButtonArea.appendChild(button);
            });
        })
        .catch((error) => console.error("行動読込エラー", error));
}

function showActionGuidance(message) {
    const guidance = document.createElement("div");
    guidance.className = "action-guidance";
    guidance.textContent = message;
    actionButtonArea.appendChild(guidance);
}

// ============================================================
// 記録ボタン
// ============================================================
function updateRecordButtonState() {
    recordButton.disabled =
        selectedEquipmentName === "" ||
        selectedEquipmentGroup === null ||
        selectedActionName === "" ||
        selectedActionGroup === null ||
        selectedEquipmentGroup !== selectedActionGroup;
}

// ============================================================
// 記録
// 設備は保持、行動のみ解除
// ============================================================
recordButton.addEventListener("click", function () {
    if (selectedEquipmentName === "" || selectedEquipmentGroup === null) {
        alert("対象設備を選択してください。");
        return;
    }

    if (selectedActionName === "" || selectedActionGroup === null) {
        alert("行動を選択してください。");
        return;
    }

    if (selectedEquipmentGroup !== selectedActionGroup) {
        alert("対象設備と行動の分類No.が一致していません。");
        clearActionSelection();
        return;
    }

    const now = new Date();

    const logData = {
        date: formatDate(now),
        time: formatTime(now),
        equipment: selectedEquipmentName,
        action: selectedActionName,
        timestamp: now.getTime()
    };

    const transaction = db.transaction(LOG_STORE, "readwrite");
    const store = transaction.objectStore(LOG_STORE);
    const request = store.add(logData);

    request.onsuccess = function () {
        clearActionSelection();
        loadHistory();
    };

    request.onerror = function (event) {
        console.error("保存エラー", event.target.error);
        alert("記録の保存に失敗しました。");
    };
});

function clearActionSelection() {
    selectedActionName = "";
    selectedActionGroup = null;

    document
        .querySelectorAll(".action-button")
        .forEach((btn) => btn.classList.remove("selected"));

    updateRecordButtonState();
}

// ============================================================
// 本日の履歴
// ============================================================
function loadHistory() {
    if (!db) return;

    getAllFromStore(LOG_STORE)
        .then((logs) => {
            const today = formatDate(new Date());

            const todayLogs = logs
                .filter((log) => log.date === today)
                .sort((a, b) => b.timestamp - a.timestamp);

            displayHistory(todayLogs);
        })
        .catch((error) => console.error("履歴読込エラー", error));
}

function displayHistory(logs) {
    historyList.innerHTML = "";

    if (logs.length === 0) {
        historyList.innerHTML = "<p>まだ記録はありません。</p>";
        return;
    }

    logs.forEach((log) => {
        const item = document.createElement("div");
        item.className = "history-item";

        const text = document.createElement("div");
        text.className = "history-text";
        text.textContent = `${log.time}　${log.equipment}　${log.action}`;

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "delete-button";
        deleteButton.textContent = "削除";

        deleteButton.addEventListener("click", function () {
            const ok = confirm(
                `${log.time} ${log.equipment} ${log.action}\n\nこの記録を削除しますか？`
            );

            if (ok) {
                deleteLog(log.id);
            }
        });

        item.appendChild(text);
        item.appendChild(deleteButton);
        historyList.appendChild(item);
    });
}

// ============================================================
// 直前記録取り消し
// ============================================================
undoButton.addEventListener("click", function () {
    getAllFromStore(LOG_STORE)
        .then((logs) => {
            const today = formatDate(new Date());

            const todayLogs = logs
                .filter((log) => log.date === today)
                .sort((a, b) => b.timestamp - a.timestamp);

            if (todayLogs.length === 0) {
                alert("取り消す記録がありません。");
                return;
            }

            const lastLog = todayLogs[0];

            const ok = confirm(
                `直前の記録\n\n${lastLog.time} ${lastLog.equipment} ${lastLog.action}\n\nを取り消しますか？`
            );

            if (ok) {
                deleteLog(lastLog.id);
            }
        })
        .catch((error) => console.error("Undo読込エラー", error));
});

function deleteLog(id) {
    const transaction = db.transaction(LOG_STORE, "readwrite");
    const store = transaction.objectStore(LOG_STORE);
    const request = store.delete(id);

    request.onsuccess = function () {
        loadHistory();
    };

    request.onerror = function (event) {
        console.error("削除エラー", event.target.error);
        alert("削除に失敗しました。");
    };
}

// ============================================================
// CSV出力
// ============================================================
csvButton.addEventListener("click", function () {
    getAllFromStore(LOG_STORE)
        .then((logs) => {
            if (logs.length === 0) {
                alert("出力する記録がありません。");
                return;
            }

            logs.sort((a, b) => a.timestamp - b.timestamp);

            let csv = "ID,Date,Time,Equipment,Action\r\n";

            logs.forEach((log) => {
                csv += [
                    escapeCSV(log.id),
                    escapeCSV(log.date),
                    escapeCSV(log.time),
                    escapeCSV(log.equipment),
                    escapeCSV(log.action)
                ].join(",") + "\r\n";
            });

            const bom = "\uFEFF";
            const blob = new Blob([bom + csv], {
                type: "text/csv;charset=utf-8;"
            });

            const now = new Date();
            const workerNameForFile = getWorkerNameForFile();

            const fileName =
                `EquipmentWorkLog_${workerNameForFile}_${formatDateCompact(now)}_${formatTimeCompact(now)}.csv`;

            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = url;
            link.download = fileName;

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setTimeout(() => URL.revokeObjectURL(url), 1000);
        })
        .catch((error) => {
            console.error("CSV出力エラー", error);
            alert("CSV出力に失敗しました。");
        });
});

// ============================================================
// データ保存状況
// ============================================================
function updateStorageStatus() {
    if (!db) {
        recordCount.textContent = "-- 件";
        storageUsage.textContent = "--";
        return;
    }

    const transaction = db.transaction(LOG_STORE, "readonly");
    const store = transaction.objectStore(LOG_STORE);
    const countRequest = store.count();

    countRequest.onsuccess = function () {
        recordCount.textContent =
            countRequest.result.toLocaleString("ja-JP") + " 件";
    };

    countRequest.onerror = function () {
        recordCount.textContent = "取得失敗";
    };

    if (navigator.storage && navigator.storage.estimate) {
        navigator.storage.estimate()
            .then(function (estimate) {
                const usage = estimate.usage || 0;
                storageUsage.textContent = formatBytes(usage);
            })
            .catch(function () {
                storageUsage.textContent = "取得失敗";
            });
    } else {
        storageUsage.textContent = "未対応";
    }
}

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024) {
        return (bytes / (1024 * 1024)).toFixed(2) + " MB";
    }

    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

// ============================================================
// 設定画面
// ============================================================
settingsButton.addEventListener("click", function () {
    settingsScreen.classList.remove("hidden");
    loadEquipmentSettings();
    loadActionSettings();
    updateStorageStatus();
});

settingsCloseButton.addEventListener("click", async function () {
    settingsScreen.classList.add("hidden");

    await validateCurrentSelections();

    loadEquipmentButtons();
    loadActionButtons();
    updateRecordButtonState();
});

// -------------------------
// 設備設定
// -------------------------
function loadEquipmentSettings() {
    getAllFromStore(EQUIPMENT_STORE)
        .then((equipments) => {
            equipmentSettingsList.innerHTML = "";

            equipments.forEach((equipment) => {
                equipmentSettingsList.appendChild(
                    createSettingRow(
                        equipment,
                        EQUIPMENT_STORE,
                        loadEquipmentSettings
                    )
                );
            });
        })
        .catch((error) => console.error("設備設定読込エラー", error));
}

addEquipmentButton.addEventListener("click", function () {
    addMasterItem(
        EQUIPMENT_STORE,
        newEquipmentName,
        newEquipmentGroup,
        loadEquipmentSettings
    );
});

// -------------------------
// 行動設定
// -------------------------
function loadActionSettings() {
    getAllFromStore(ACTION_STORE)
        .then((actions) => {
            actionSettingsList.innerHTML = "";

            actions.forEach((action) => {
                actionSettingsList.appendChild(
                    createSettingRow(
                        action,
                        ACTION_STORE,
                        loadActionSettings
                    )
                );
            });
        })
        .catch((error) => console.error("行動設定読込エラー", error));
}

addActionButton.addEventListener("click", function () {
    addMasterItem(
        ACTION_STORE,
        newActionName,
        newActionGroup,
        loadActionSettings
    );
});

// -------------------------
// 設定行作成
// -------------------------
function createSettingRow(item, storeName, reloadFunction) {
    const row = document.createElement("div");
    row.className = "setting-item";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "setting-input";
    nameInput.value = item.name;
    nameInput.maxLength = 30;

    const groupInput = document.createElement("input");
    groupInput.type = "number";
    groupInput.className = "setting-group-input";
    groupInput.min = "1";
    groupInput.max = "999";
    groupInput.step = "1";
    groupInput.value = normalizeGroup(item.group);
    groupInput.setAttribute("aria-label", "分類番号");
    applyGroupClass(groupInput, item.group);

    groupInput.addEventListener("input", function () {
        const group = parseGroupInput(groupInput.value);

        if (group === null) {
            for (let i = 1; i <= 8; i++) {
                groupInput.classList.remove("group-" + i);
            }
            return;
        }

        applyGroupClass(groupInput, group);
    });

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "setting-save-button";
    saveButton.textContent = "変更";

    saveButton.addEventListener("click", async function () {
        const newName = nameInput.value.trim();
        const newGroup = parseGroupInput(groupInput.value);

        if (newName === "") {
            alert("名称を入力してください。");
            return;
        }

        if (newGroup === null) {
            alert("分類No.は1～999の整数で入力してください。");
            return;
        }

        const duplicate = await masterNameExists(
            storeName,
            newName,
            item.id
        );

        if (duplicate) {
            alert("同じ名称がすでに登録されています。");
            return;
        }

        updateMasterItem(
            storeName,
            item.id,
            newName,
            newGroup,
            reloadFunction
        );
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "setting-delete-button";
    deleteButton.textContent = "削除";

    deleteButton.addEventListener("click", function () {
        const ok = confirm(
            `「${item.name}」を設定から削除しますか？\n\n過去の行動記録は削除されません。`
        );

        if (ok) {
            deleteMasterItem(
                storeName,
                item.id,
                reloadFunction
            );
        }
    });

    row.appendChild(nameInput);
    row.appendChild(groupInput);
    row.appendChild(saveButton);
    row.appendChild(deleteButton);

    return row;
}

// -------------------------
// マスタ追加
// -------------------------
async function addMasterItem(
    storeName,
    nameInputElement,
    groupInputElement,
    reloadFunction
) {
    const name = nameInputElement.value.trim();
    const group = parseGroupInput(groupInputElement.value);

    if (name === "") {
        alert("名称を入力してください。");
        return;
    }

    if (group === null) {
        alert("分類No.は1～999の整数で入力してください。");
        return;
    }

    const duplicate = await masterNameExists(storeName, name);

    if (duplicate) {
        alert("同じ名称がすでに登録されています。");
        return;
    }

    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);

    store.add({ name, group });

    transaction.oncomplete = function () {
        nameInputElement.value = "";
        reloadFunction();

        if (storeName === EQUIPMENT_STORE) {
            loadEquipmentButtons();
        } else if (storeName === ACTION_STORE) {
            loadActionButtons();
        }
    };

    transaction.onerror = function () {
        alert("追加に失敗しました。");
    };
}

// -------------------------
// マスタ変更
// -------------------------
function updateMasterItem(
    storeName,
    id,
    newName,
    newGroup,
    reloadFunction
) {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.get(id);

    let oldName = "";
    let oldGroup = null;

    request.onsuccess = function () {
        const item = request.result;

        if (!item) {
            alert("対象データが見つかりません。");
            return;
        }

        oldName = item.name;
        oldGroup = normalizeGroup(item.group);

        item.name = newName;
        item.group = newGroup;

        store.put(item);
    };

    transaction.oncomplete = function () {
        if (
            storeName === EQUIPMENT_STORE &&
            selectedEquipmentName === oldName &&
            selectedEquipmentGroup === oldGroup
        ) {
            selectedEquipmentName = newName;
            selectedEquipmentGroup = newGroup;

            // 設備の分類変更時は選択中行動を必ず解除
            clearActionSelection();
        }

        if (
            storeName === ACTION_STORE &&
            selectedActionName === oldName &&
            selectedActionGroup === oldGroup
        ) {
            selectedActionName = "";

            selectedActionGroup = null;
        }

        reloadFunction();

        if (storeName === EQUIPMENT_STORE) {
            loadEquipmentButtons();
            loadActionButtons();
        } else if (storeName === ACTION_STORE) {
            loadActionButtons();
        }

        updateRecordButtonState();
    };

    transaction.onerror = function () {
        alert("変更に失敗しました。");
    };
}

// -------------------------
// マスタ削除
// -------------------------
function deleteMasterItem(storeName, id, reloadFunction) {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const getRequest = store.get(id);

    let deletedName = "";
    let deletedGroup = null;

    getRequest.onsuccess = function () {
        if (getRequest.result) {
            deletedName = getRequest.result.name;
            deletedGroup = normalizeGroup(getRequest.result.group);
            store.delete(id);
        }
    };

    transaction.oncomplete = function () {
        if (
            storeName === EQUIPMENT_STORE &&
            selectedEquipmentName === deletedName &&
            selectedEquipmentGroup === deletedGroup
        ) {
            selectedEquipmentName = "";
            selectedEquipmentGroup = null;
            clearActionSelection();
        }

        if (
            storeName === ACTION_STORE &&
            selectedActionName === deletedName &&
            selectedActionGroup === deletedGroup
        ) {
            selectedActionName = "";
            selectedActionGroup = null;
        }

        reloadFunction();

        if (storeName === EQUIPMENT_STORE) {
            loadEquipmentButtons();
            loadActionButtons();
        } else if (storeName === ACTION_STORE) {
            loadActionButtons();
        }

        updateRecordButtonState();
    };

    transaction.onerror = function () {
        alert("削除に失敗しました。");
    };
}

// -------------------------
// 重複確認
// -------------------------
async function masterNameExists(storeName, name, excludeId = null) {
    const items = await getAllFromStore(storeName);

    return items.some((item) =>
        item.name === name &&
        item.id !== excludeId
    );
}

// ============================================================
// 選択状態の整合性確認
// ============================================================
async function validateCurrentSelections() {
    const equipments = await getAllFromStore(EQUIPMENT_STORE);
    const actions = await getAllFromStore(ACTION_STORE);

    const selectedEquipmentExists = equipments.some((item) =>
        item.name === selectedEquipmentName &&
        normalizeGroup(item.group) === selectedEquipmentGroup
    );

    if (selectedEquipmentName !== "" && !selectedEquipmentExists) {
        selectedEquipmentName = "";
        selectedEquipmentGroup = null;
        selectedActionName = "";
        selectedActionGroup = null;
    }

    const selectedActionExists = actions.some((item) =>
        item.name === selectedActionName &&
        normalizeGroup(item.group) === selectedActionGroup &&
        selectedActionGroup === selectedEquipmentGroup
    );

    if (selectedActionName !== "" && !selectedActionExists) {
        selectedActionName = "";
        selectedActionGroup = null;
    }

    updateRecordButtonState();
}

// ============================================================
// 分類No. 色分け
// 1～8を固定色として、9以上は循環利用する
// ============================================================
function getGroupClass(group) {
    const normalizedGroup = ((normalizeGroup(group) - 1) % 8) + 1;
    return "group-" + normalizedGroup;
}

function applyGroupClass(element, group) {
    for (let i = 1; i <= 8; i++) {
        element.classList.remove("group-" + i);
    }

    element.classList.add(getGroupClass(group));
}

// ============================================================
// 分類No.共通
// ============================================================
function isValidGroup(value) {
    const n = Number(value);

    return Number.isInteger(n) && n >= 1 && n <= 999;
}

function normalizeGroup(value) {
    return isValidGroup(value) ? Number(value) : 1;
}

function parseGroupInput(value) {
    const n = Number(value);

    if (!Number.isInteger(n) || n < 1 || n > 999) {
        return null;
    }

    return n;
}

// ============================================================
// Object Store全件取得
// ============================================================
function getAllFromStore(storeName) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = function () {
            resolve(request.result);
        };

        request.onerror = function () {
            reject(request.error);
        };
    });
}

// ============================================================
// 日時
// ============================================================
function formatDate(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");

    return `${yyyy}-${mm}-${dd}`;
}

function formatTime(date) {
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");

    return `${hh}:${mm}:${ss}`;
}

function formatDateCompact(date) {
    return formatDate(date).replaceAll("-", "");
}

function formatTimeCompact(date) {
    return formatTime(date).replaceAll(":", "");
}

// ============================================================
// CSV
// ============================================================
function escapeCSV(value) {
    if (value === null || value === undefined) {
        return '""';
    }

    const text = String(value).replace(/"/g, '""');

    return `"${text}"`;
}

// 新規追加用の分類No.入力欄も色分け
function initializeNewGroupInputColors() {
    [newEquipmentGroup, newActionGroup].forEach(function (input) {
        applyGroupClass(input, input.value);

        input.addEventListener("input", function () {
            const group = parseGroupInput(input.value);

            if (group === null) {
                for (let i = 1; i <= 8; i++) {
                    input.classList.remove("group-" + i);
                }
                return;
            }

            applyGroupClass(input, group);
        });
    });
}

// ============================================================
// 起動
// ============================================================
openDatabase();
updateRecordButtonState();
loadWorkerName();
initializeNewGroupInputColors();

// ============================================================
// Service Worker
// ============================================================
if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
        navigator.serviceWorker
            .register("./service-worker.js")
            .then((registration) => {
                console.log("Service Worker登録成功", registration.scope);
            })
            .catch((error) => {
                console.error("Service Worker登録失敗", error);
            });
    });
}
