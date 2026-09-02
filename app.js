// ============================================================
// 設備別 行動記録 PWA
// 新規アプリ用：旧PWAとは別のIndexedDBを使用
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
const addEquipmentButton = document.getElementById("add-equipment-button");

const newActionName = document.getElementById("new-action-name");
const addActionButton = document.getElementById("add-action-button");

// -------------------------
// 選択状態
// -------------------------
let selectedEquipmentName = "";
let selectedActionName = "";

// -------------------------
// IndexedDB
// 旧アプリと名前を変えて完全分離
// -------------------------
const DB_NAME = "EquipmentWorkLogDB";
const DB_VERSION = 1;

const LOG_STORE = "workLogs";
const EQUIPMENT_STORE = "equipments";
const ACTION_STORE = "actions";

let db = null;

// -------------------------
// 初期値
// 必要に応じて設定画面で変更可能
// -------------------------
const DEFAULT_EQUIPMENTS = [
    "設備A",
    "設備B",
    "設備C",
    "設備D"
];

const DEFAULT_ACTIONS = [
    "加工",
    "段取り",
    "測定",
    "補正",
    "清掃",
    "トラブル",
    "待機",
    "その他"
];

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
// IndexedDBを開く
// ============================================================
function openDatabase() {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = function (event) {
        const upgradeDb = event.target.result;

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
// 初期マスタ作成
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

function initializeStoreIfEmpty(storeName, names) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const countRequest = store.count();

        countRequest.onsuccess = function () {
            if (countRequest.result === 0) {
                names.forEach((name) => {
                    store.add({ name });
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

                if (equipment.name === selectedEquipmentName) {
                    button.classList.add("selected");
                }

                button.addEventListener("click", function () {
                    selectedEquipmentName = equipment.name;

                    document
                        .querySelectorAll(".equipment-button")
                        .forEach((btn) => btn.classList.remove("selected"));

                    button.classList.add("selected");

                    updateRecordButtonState();
                });

                equipmentButtonArea.appendChild(button);
            });
        })
        .catch((error) => console.error("設備読込エラー", error));
}

// ============================================================
// 行動ボタン
// ============================================================
function loadActionButtons() {
    getAllFromStore(ACTION_STORE)
        .then((actions) => {
            actionButtonArea.innerHTML = "";

            actions.forEach((action) => {
                const button = document.createElement("button");

                button.type = "button";
                button.className = "action-button";
                button.textContent = action.name;

                if (action.name === selectedActionName) {
                    button.classList.add("selected");
                }

                button.addEventListener("click", function () {
                    selectedActionName = action.name;

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

// ============================================================
// 記録ボタン状態
// ============================================================
function updateRecordButtonState() {
    recordButton.disabled =
        selectedEquipmentName === "" ||
        selectedActionName === "";
}

// ============================================================
// 記録
// 設備は記録後も保持、行動だけ解除する
// ============================================================
recordButton.addEventListener("click", function () {
    if (selectedEquipmentName === "") {
        alert("対象設備を選択してください。");
        return;
    }

    if (selectedActionName === "") {
        alert("行動を選択してください。");
        return;
    }

    const now = new Date();

    const date = formatDate(now);
    const time = formatTime(now);

    const logData = {
        date,
        time,
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
// 直前記録の取り消し
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
// 全期間を出力
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

            const fileName =
                `EquipmentWorkLog_${formatDateCompact(now)}_${formatTimeCompact(now)}.csv`;

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
// 設定画面
// ============================================================
settingsButton.addEventListener("click", function () {
    settingsScreen.classList.remove("hidden");
    loadEquipmentSettings();
    loadActionSettings();
});

settingsCloseButton.addEventListener("click", function () {
    settingsScreen.classList.add("hidden");

    validateCurrentSelections();

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
        loadActionSettings
    );
});

// -------------------------
// 設定行作成
// -------------------------
function createSettingRow(item, storeName, reloadFunction) {
    const row = document.createElement("div");
    row.className = "setting-item";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "setting-input";
    input.value = item.name;
    input.maxLength = 30;

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "setting-save-button";
    saveButton.textContent = "変更";

    saveButton.addEventListener("click", async function () {
        const newName = input.value.trim();

        if (newName === "") {
            alert("名称を入力してください。");
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

    row.appendChild(input);
    row.appendChild(saveButton);
    row.appendChild(deleteButton);

    return row;
}

// -------------------------
// マスタ追加
// -------------------------
async function addMasterItem(storeName, inputElement, reloadFunction) {
    const name = inputElement.value.trim();

    if (name === "") {
        alert("名称を入力してください。");
        return;
    }

    const duplicate = await masterNameExists(storeName, name);

    if (duplicate) {
        alert("同じ名称がすでに登録されています。");
        return;
    }

    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);

    store.add({ name });

    transaction.oncomplete = function () {
        inputElement.value = "";
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
function updateMasterItem(storeName, id, newName, reloadFunction) {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.get(id);

    request.onsuccess = function () {
        const item = request.result;

        if (!item) {
            alert("対象データが見つかりません。");
            return;
        }

        const oldName = item.name;
        item.name = newName;
        store.put(item);

        if (storeName === EQUIPMENT_STORE &&
            selectedEquipmentName === oldName) {

            selectedEquipmentName = newName;
        }

        if (storeName === ACTION_STORE &&
            selectedActionName === oldName) {

            selectedActionName = newName;
        }
    };

    transaction.oncomplete = function () {
        reloadFunction();

        if (storeName === EQUIPMENT_STORE) {
            loadEquipmentButtons();
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

    getRequest.onsuccess = function () {
        if (getRequest.result) {
            deletedName = getRequest.result.name;
            store.delete(id);
        }
    };

    transaction.oncomplete = function () {
        if (storeName === EQUIPMENT_STORE &&
            selectedEquipmentName === deletedName) {

            selectedEquipmentName = "";
        }

        if (storeName === ACTION_STORE &&
            selectedActionName === deletedName) {

            selectedActionName = "";
        }

        reloadFunction();

        if (storeName === EQUIPMENT_STORE) {
            loadEquipmentButtons();
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
// 設定変更後の選択状態確認
// ============================================================
async function validateCurrentSelections() {
    const equipments = await getAllFromStore(EQUIPMENT_STORE);
    const actions = await getAllFromStore(ACTION_STORE);

    if (
        selectedEquipmentName !== "" &&
        !equipments.some((item) => item.name === selectedEquipmentName)
    ) {
        selectedEquipmentName = "";
    }

    if (
        selectedActionName !== "" &&
        !actions.some((item) => item.name === selectedActionName)
    ) {
        selectedActionName = "";
    }

    updateRecordButtonState();
}

// ============================================================
// 共通：Object Store全件取得
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
// 共通：日時
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
// 共通：CSV
// ============================================================
function escapeCSV(value) {
    if (value === null || value === undefined) {
        return '""';
    }

    const text = String(value).replace(/"/g, '""');

    return `"${text}"`;
}

// ============================================================
// 起動
// ============================================================
openDatabase();
updateRecordButtonState();

// ============================================================
// Service Worker登録
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
