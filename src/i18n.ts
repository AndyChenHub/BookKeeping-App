import { format, isToday, isYesterday, parseISO, isValid } from "date-fns";
import type { Language } from "./types";

export const translations = {
  zh: {
    appName: "记账本",
    synced: "实时同步",
    phoneConnected: (n: number) => `已连接 ${n} 部手机`,
    connectPhoneBtn: "手机扫码",
    tabEntry: "记一笔",
    tabRecords: "查账目",
    tabBackup: "备份与设置",

    // Entry Screen
    stepWhat: "1. 选择项目内容",
    stepWhatHint: "点选一项或多项（保存时自动存为英文 Excel）",
    clearSelection: "清空已选",
    addNewItemBtn: "新增项目",
    extraNotePlaceholder: "补充说明（可选，如房号或备注）",
    selectedLabel: "已选择：",
    noneSelectedYet: "请点击上方按钮选择项目",

    stepAmount: "2. 填写金额与付款方式",
    totalAmount: "总金额",
    paymentMethod: "付款方式",
    cash: "现金",
    card: "刷卡",
    partsCost: "零件费（可选）",
    gstAmount: "消费税 GST（可选）",
    calcGst10: "自动算 10% 税",
    noGst: "无税 $0",

    stepDetails: "3. 日期、地点与经办人",
    dateLabel: "日期",
    today: "今天",
    yesterday: "昨天",
    otherDate: "选择日期",
    locationLabel: "地点",
    locationPlaceholder: "点击选择地点（可选）",
    agentLabel: "经办人",
    agentPlaceholder: "点击选择经办人（可选）",

    saveEntryBtn: "保存这笔账目",
    saveEntryWithAmount: (amt: string) => `保存这笔账目 ($${amt})`,
    saving: "正在保存...",
    validationMissingBoth: "请先选择【项目内容】并填写【总金额】",
    validationMissingDesc: "请先在上方点选至少一个【项目内容】",
    validationMissingTotal: "请填写【总金额】",
    savedSuccessTitle: "已保存！",
    savedSuccessSub: "已安全写入账本并同步到所有设备",

    savedTodayTitle: "今天已记账目",
    savedTodayEmpty: "今天还没有记录，保存后会显示在这里",
    viewAllRecords: "查看全部账目",

    // Records Screen
    thisMonth: "回到本月",
    openExcelBtn: "用 Excel 打开",
    downloadExcelBtn: "下载 Excel 表格",
    monthTotal: "本月总计",
    recordsCount: (n: number) => `共 ${n} 笔记录`,
    filterAll: "全部",
    filterCash: "仅看现金",
    filterCard: "仅看刷卡",
    searchPlaceholder: "搜索项目、地点或经办人...",
    noRecordsMonth: "这个月还没有账目记录",
    noRecordsSearch: "没有找到符合条件的记录",
    partsShort: "零件",
    gstShort: "税 GST",
    editBtn: "修改",
    deleteBtn: "删除",
    unassignedLocation: "未填地点",
    unassignedAgent: "未填经办人",

    // Edit Modal
    editRecordTitle: "修改账目记录",
    descriptionField: "项目内容",
    saveChangesBtn: "保存修改",
    cancelBtn: "取消",
    closeBtn: "关闭",

    // Delete Confirm
    deleteConfirmTitle: "确定要删除这笔记录吗？",
    deleteConfirmBody: (desc: string, total: string) =>
      `将从 Excel 账本中删除「${desc}」（$${total}）。`,
    confirmDeleteBtn: "确认删除",

    // Backup & Settings Screen
    backupHeroTitle: "自动备份保护中",
    backupProtectedToday: "今日已自动备份，账本安全无忧",
    backupPendingToday: "点击下方按钮可立即创建备份",
    lastBackupTime: (timeStr: string) => `最近一次备份：${timeStr}`,
    backupNowBtn: "立即手动备份",
    backingUp: "正在备份...",
    backupSuccessToast: "备份已完成！",
    restoreSuccessToast: "账本已成功恢复！",

    restoreSectionTitle: "恢复以前的账本",
    restoreSectionHint: "如果不小心改错或删错了，点「恢复」就能回到当时的状态。恢复前系统会自动为您保留一份当前数据的备份。",
    noBackupsYet: "暂无备份记录",
    reasonDaily: "每日自动备份",
    reasonManual: "手动备份",
    reasonSafety: "恢复前保护备份",
    backupSummary: (records: number, total: string) => `${records} 笔记录 · 共 $${total}`,
    restoreBtn: "恢复此备份",

    restoreConfirmTitle: "恢复到这个时间的账本？",
    restoreConfirmBody: (timeStr: string) =>
      `所有账目将恢复到「${timeStr}」时的状态。请放心，系统会先自动备份您当前的账目，绝不会丢失数据。`,
    confirmRestoreBtn: "确认恢复",

    // Phone Connect
    phoneCardTitle: "在手机和电脑上一起使用",
    phoneCardDesc: "确保手机与这台电脑连接同一个 Wi-Fi，用手机相机扫一扫下方二维码即可直接打开记账。",
    phoneScanStep1: "1. 打开手机自带「相机」对准二维码",
    phoneScanStep2: "2. 点击弹出的网页链接即可开始使用",
    phoneHomeScreenTip: "小贴士：在苹果手机 Safari 点底部「分享 → 添加到主屏幕」，以后就像普通手机 App 一样一点即开！",
    copyLinkBtn: "复制网址",
    copiedBtn: "已复制！",
    networkAdapterLabel: "切换网络地址：",
    firewallTip: "如果手机打不开：请检查手机和电脑是否在同一个 Wi-Fi，并在电脑弹出防火墙提示时点击「允许访问」。",

    // Manage Lists
    manageListsTitle: "管理常用选项",
    manageDescriptions: "项目名称",
    manageLocations: "常用地点",
    manageAgents: "经办人",
    addBtn: "添加",
    removeBtn: "删除",
    emptyListHint: "还没有添加，点击右上角「添加」即可新增",

    // Storage Folder
    storageTitle: "Excel 账本存放文件夹",
    storageHint: "所有按月分类的 Excel 表格（如 202611Book.xlsx）都保存在这里：",
    openFolderBtn: "打开文件夹",
    changeFolderBtn: "更改位置...",
    resetFolderBtn: "恢复默认位置",

    // Modals (Picker & Add)
    pickLocationTitle: "选择地点",
    pickAgentTitle: "选择经办人",
    clearChoice: "不填 / 清空选择",
    searchOrSelect: "搜索...",
    addNewLocation: "新增地点",
    addNewAgent: "新增经办人",
    zhNameLabel: "中文名称",
    zhNamePlaceholder: "例如：空调维修",
    enNameLabel: "英文名称（用于写入 Excel 表格）",
    enNamePlaceholder: "例如：Aircon Repair",
    singleNameLabel: "名称",
    singleNamePlaceholder: "请输入名称...",
    confirmAddBtn: "确认添加",
    selectDateTitle: "选择日期",
    weekdays: ["日", "一", "二", "三", "四", "五", "六"],
    loadingText: "正在打开记账本...",
  },
  en: {
    appName: "BookKeeping",
    synced: "Live Sync",
    phoneConnected: (n: number) => `${n} Phone${n > 1 ? "s" : ""} Connected`,
    connectPhoneBtn: "Connect Phone",
    tabEntry: "New Entry",
    tabRecords: "Records",
    tabBackup: "Backup & Setup",

    // Entry Screen
    stepWhat: "1. What was this for?",
    stepWhatHint: "Tap one or more items below",
    clearSelection: "Clear",
    addNewItemBtn: "New Item",
    extraNotePlaceholder: "Extra note (optional, e.g. Unit 4)",
    selectedLabel: "Selected:",
    noneSelectedYet: "Tap any item button above to begin",

    stepAmount: "2. Amount & Payment",
    totalAmount: "Total Amount",
    paymentMethod: "Payment Method",
    cash: "Cash",
    card: "Card",
    partsCost: "Parts Cost (Optional)",
    gstAmount: "GST (Optional)",
    calcGst10: "Auto 10% GST",
    noGst: "No GST ($0)",

    stepDetails: "3. Date, Location & Person",
    dateLabel: "Date",
    today: "Today",
    yesterday: "Yesterday",
    otherDate: "Pick Date",
    locationLabel: "Location",
    locationPlaceholder: "Tap to choose location (optional)",
    agentLabel: "Person / Agent",
    agentPlaceholder: "Tap to choose person (optional)",

    saveEntryBtn: "Save Entry",
    saveEntryWithAmount: (amt: string) => `Save Entry ($${amt})`,
    saving: "Saving...",
    validationMissingBoth: "Please select an item above and enter the Total Amount",
    validationMissingDesc: "Please tap at least one item in Step 1",
    validationMissingTotal: "Please enter the Total Amount in Step 2",
    savedSuccessTitle: "Saved!",
    savedSuccessSub: "Saved to Excel and synced across your devices",

    savedTodayTitle: "Saved Today",
    savedTodayEmpty: "Entries you save today will appear right here",
    viewAllRecords: "View All Records",

    // Records Screen
    thisMonth: "This Month",
    openExcelBtn: "Open in Excel",
    downloadExcelBtn: "Download Excel",
    monthTotal: "Month Total",
    recordsCount: (n: number) => `${n} record${n === 1 ? "" : "s"}`,
    filterAll: "All",
    filterCash: "Cash Only",
    filterCard: "Card Only",
    searchPlaceholder: "Search item, location, or person...",
    noRecordsMonth: "No entries saved for this month yet",
    noRecordsSearch: "No matching records found",
    partsShort: "Parts",
    gstShort: "GST",
    editBtn: "Edit",
    deleteBtn: "Delete",
    unassignedLocation: "No location",
    unassignedAgent: "No person",

    // Edit Modal
    editRecordTitle: "Edit Record",
    descriptionField: "Description",
    saveChangesBtn: "Save Changes",
    cancelBtn: "Cancel",
    closeBtn: "Close",

    // Delete Confirm
    deleteConfirmTitle: "Delete this record?",
    deleteConfirmBody: (desc: string, total: string) =>
      `"${desc}" ($${total}) will be removed from your Excel book.`,
    confirmDeleteBtn: "Delete Record",

    // Backup & Settings Screen
    backupHeroTitle: "Automatic Daily Backup is On",
    backupProtectedToday: "Backed up today — your books are safely protected",
    backupPendingToday: "Tap below to create a backup anytime",
    lastBackupTime: (timeStr: string) => `Latest backup: ${timeStr}`,
    backupNowBtn: "Back Up Now",
    backingUp: "Backing up...",
    backupSuccessToast: "Backup created!",
    restoreSuccessToast: "Books restored successfully!",

    restoreSectionTitle: "Restore from a Backup",
    restoreSectionHint: "Made a mistake? Tap Restore on any date below to roll back. We automatically save a safety copy of your current data first.",
    noBackupsYet: "No backups yet",
    reasonDaily: "Daily Auto Backup",
    reasonManual: "Manual Backup",
    reasonSafety: "Pre-Restore Safety Copy",
    backupSummary: (records: number, total: string) =>
      `${records} record${records === 1 ? "" : "s"} · $${total}`,
    restoreBtn: "Restore",

    restoreConfirmTitle: "Restore to this backup?",
    restoreConfirmBody: (timeStr: string) =>
      `Your records will be restored to "${timeStr}". Don't worry — a safety copy of your current records will be saved automatically first.`,
    confirmRestoreBtn: "Restore Now",

    // Phone Connect
    phoneCardTitle: "Use on Computer & Phone",
    phoneCardDesc: "Connect your phone to the same Wi-Fi as this computer, then point your phone's Camera at this QR code.",
    phoneScanStep1: "1. Open the Camera app on your iPhone or Android",
    phoneScanStep2: "2. Tap the link that pops up on screen",
    phoneHomeScreenTip: "Tip: On iPhone Safari, tap Share → Add to Home Screen so you can open it anytime with one tap like a native app!",
    copyLinkBtn: "Copy Link",
    copiedBtn: "Copied!",
    networkAdapterLabel: "Network address:",
    firewallTip: "Trouble connecting? Check that both devices are on the same Wi-Fi, and click 'Allow access' if Windows Firewall prompts you.",

    // Manage Lists
    manageListsTitle: "Manage Saved Lists",
    manageDescriptions: "Items",
    manageLocations: "Locations",
    manageAgents: "People / Agents",
    addBtn: "Add",
    removeBtn: "Remove",
    emptyListHint: "None added yet — tap Add to create one",

    // Storage Folder
    storageTitle: "Excel Storage Folder",
    storageHint: "Your monthly Excel files (e.g. 202611Book.xlsx) are stored here:",
    openFolderBtn: "Open Folder",
    changeFolderBtn: "Change Folder...",
    resetFolderBtn: "Reset to Default",

    // Modals
    pickLocationTitle: "Choose Location",
    pickAgentTitle: "Choose Person / Agent",
    clearChoice: "None (Clear)",
    searchOrSelect: "Search...",
    addNewLocation: "Add Location",
    addNewAgent: "Add Person / Agent",
    zhNameLabel: "Chinese Name (中文)",
    zhNamePlaceholder: "e.g. 空调维修",
    enNameLabel: "English Name (Saved to Excel)",
    enNamePlaceholder: "e.g. Aircon Repair",
    singleNameLabel: "Name",
    singleNamePlaceholder: "Enter name...",
    confirmAddBtn: "Add",
    selectDateTitle: "Choose Date",
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    loadingText: "Opening BookKeeping...",
  },
} as const;

export function formatFriendlyDate(dateStr: string, lang: Language): string {
  const parsed = parseISO(dateStr);
  if (!isValid(parsed)) return dateStr;

  if (lang === "zh") {
    const base = format(parsed, "yyyy年M月d日");
    if (isToday(parsed)) return `今天 (${format(parsed, "M月d日")})`;
    if (isYesterday(parsed)) return `昨天 (${format(parsed, "M月d日")})`;
    return base;
  } else {
    const base = format(parsed, "EEE, d MMM yyyy");
    if (isToday(parsed)) return `Today (${format(parsed, "d MMM")})`;
    if (isYesterday(parsed)) return `Yesterday (${format(parsed, "d MMM")})`;
    return base;
  }
}

export function formatFriendlyMonth(monthKey: string, lang: Language): string {
  const parsed = parseISO(`${monthKey}-01`);
  if (!isValid(parsed)) return monthKey;
  return lang === "zh" ? format(parsed, "yyyy年M月") : format(parsed, "MMMM yyyy");
}

export function formatBackupDateTime(isoStr: string, lang: Language): string {
  const parsed = new Date(isoStr);
  if (!isValid(parsed)) return isoStr;

  if (lang === "zh") {
    if (isToday(parsed)) return `今天 ${format(parsed, "HH:mm")}`;
    if (isYesterday(parsed)) return `昨天 ${format(parsed, "HH:mm")}`;
    return format(parsed, "yyyy年M月d日 HH:mm");
  } else {
    if (isToday(parsed)) return `Today at ${format(parsed, "h:mm a")}`;
    if (isYesterday(parsed)) return `Yesterday at ${format(parsed, "h:mm a")}`;
    return format(parsed, "d MMM yyyy, h:mm a");
  }
}

export function localizeDescription(
  englishDesc: string,
  descriptionsMap: Record<string, string>,
  lang: Language
): string {
  if (!englishDesc) return "—";
  if (lang === "en") return englishDesc;

  // Build case-insensitive reverse lookup from English -> Mandarin
  const reverseMap = new Map<string, string>();
  for (const [zh, en] of Object.entries(descriptionsMap)) {
    if (en) {
      reverseMap.set(en.trim().toLowerCase(), zh);
    }
  }

  return englishDesc
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      const matched = reverseMap.get(trimmed.toLowerCase());
      return matched || trimmed;
    })
    .join("，");
}

export function localizePayment(method: string, lang: Language): string {
  const isCard = method.trim().toLowerCase() === "card";
  if (lang === "zh") {
    return isCard ? "刷卡" : "现金";
  }
  return isCard ? "Card" : "Cash";
}
