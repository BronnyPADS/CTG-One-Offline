/* ctg-actions.js - runs the page's event attributes without inline script.

   The portal's buttons were written as onclick="doThing('x')". A browser runs
   those only while the security policy allows inline script ('unsafe-inline'),
   and while it does, any HTML an attacker manages to slip into a page runs as
   script too. The same attributes are now written data-onclick="doThing('x')",
   and this file runs them instead:

   - It reads a small part of JavaScript: calls, text/number/true/false/null
     values, this / this.value / event, !, comparisons, && || ?:, if, return.
     There is no assignment and no eval.
   - It calls only the functions the page's own buttons call (ALLOWED, written
     by tools/actions-codemod.js from the attributes themselves), plus
     preventDefault / stopPropagation on the event. Anything else is refused
     and logged, never run - so injected markup can at most press one of the
     portal's own buttons, not run code of its choosing.
   - Each attribute is bound to its own element, so a handler fires at the same
     point in the event's journey as the inline one did, including for events
     that do not bubble (focus, blur, load, error, mouseenter, mouseleave).
     "return false" still cancels the default action. */
(function (root) {
  'use strict'

  // Written by tools/actions-codemod.js - do not edit by hand.
  const ALLOWED = new Set(/*ALLOWED-START*/[
    '_closePdfModal', '_closeResultPreviewModal', 'acAddLawFirm', 'acDeleteAccount', 'acDeleteLawFirmByIndex',
    'acEditAccount', 'acRememberAccountOpen', 'acRememberPageOpen', 'acRenameLawFirmByIndex', 'acResetForm',
    'acResetPassword', 'acSaveAccount', 'acSwitchTab', 'acToggleActive', 'acToggleLawFirm', 'acTogglePage',
    'acTogglePassword', 'aceAmend', 'aceDecideAmendment', 'aceLocToggle', 'aceLocToggleOption', 'aceSignRecord',
    'applyPregnancyGate', 'apptBlankSlotClick', 'apptBlockCtxDelete', 'apptBlockCtxEdit',
    'apptBlockCtxPatientComment', 'apptBlockCtxRegistration', 'apptBlockCtxSetStatus',
    'apptCancelRegistrationLink', 'apptCfgAddOption', 'apptCfgApplyDefaultMinutes', 'apptCfgCancelBreakBlockEdit',
    'apptCfgCancelEdit', 'apptCfgCancelLegendEdit', 'apptCfgChoiceChange', 'apptCfgDelete',
    'apptCfgDeleteBreakBlock', 'apptCfgDeleteEncounterCount', 'apptCfgDeleteLegend', 'apptCfgDeleteTiming',
    'apptCfgDeleteVisitAssign', 'apptCfgEdit', 'apptCfgEditBreakBlock', 'apptCfgEditLegend', 'apptCfgEditTiming',
    'apptCfgEmpDragOver', 'apptCfgEmpDragStart', 'apptCfgEmpDrop', 'apptCfgEmpOrderUpdate', 'apptCfgFilterRows',
    'apptCfgNewTiming', 'apptCfgPreviewColor', 'apptCfgQuickAddCalendar', 'apptCfgResetDefaultFacility',
    'apptCfgSaveBreakBlock', 'apptCfgSaveDefaultFacility', 'apptCfgSaveDurationCell', 'apptCfgSaveEligibility',
    'apptCfgSaveEmployeeRs', 'apptCfgSaveEncounterCount', 'apptCfgSaveLegend', 'apptCfgSavePolicy',
    'apptCfgSaveScheduler', 'apptCfgSaveVisitAssign', 'apptCfgSaveVisitGroup', 'apptCfgSaveVisitType',
    'apptCfgSetDefFacCal', 'apptCfgSetWhCalendar', 'apptCfgSetWhFacility', 'apptCfgSwitch', 'apptCfgSyncBbHex',
    'apptCfgSyncBbPicker', 'apptCfgSyncFacLabel', 'apptCfgSyncLegendHex', 'apptCfgSyncLegendPicker',
    'apptCfgToggleFacSel', 'apptCfgToggleNoEnd', 'apptCfgUpdateTiming', 'apptCfgVisitSubSwitch', 'apptCfgVtFilter',
    'apptCfgVtSetDuration', 'apptCfgVtToggle', 'apptCfgWhSubSwitch', 'apptCloseRoomLink',
    'apptContextAddAppointment', 'apptContextAddBreakBlock', 'apptCopyRoomLink', 'apptCopyShownLink',
    'apptFacilityChange', 'apptGoToDay', 'apptHideHoverCard', 'apptHoverCardHover', 'apptMonthCellClick',
    'apptNext', 'apptOpenBlockContextMenu', 'apptOpenContextMenu', 'apptOpenRoom', 'apptPatientSelectChange',
    'apptPrev', 'apptRemoveRoom', 'apptRoomChanged', 'apptScheduleHideHoverCard', 'apptSetFacilityFilter',
    'apptSetViewMode', 'apptShowHoverCard', 'apptSyncEndTime', 'apptToday', 'apptToggleHours',
    'apptToggleTelehealth', 'apptUndoLast', 'arAddTask', 'arCloseAdd', 'arGoToAce', 'arGoToPatientDetails',
    'arIssuesChanged', 'arOpenAdd', 'arPayFillFull', 'arPayMethodChange', 'arPayRenderPreview', 'arPayTypeChange',
    'arPrintStatement', 'arPrintSummary', 'arRenderPatientOptions', 'arSaveBillingFacility', 'arSaveNote',
    'arSelectPatient', 'arSetStatusTab', 'arSubmitAdd', 'arToggleOldNotes', 'arWriteOff', 'armCancel', 'armDelete',
    'armEdit', 'armSave', 'auditClearFilters', 'auditPage', 'auditReload', 'bkAsk', 'bkClose', 'bkConfirmChanged',
    'bkCreate', 'bkPrune', 'bkRun', 'bkVerify', 'breakPreviewColor', 'breakSyncEndTime', 'buReloadPage',
    'caAddToList', 'caApply', 'caAssignRoom', 'caClearFilter', 'caEncounterForSelected', 'caManageList',
    'caOnField', 'caRemoveSelected', 'caSaveFilter', 'caSelectRow', 'caSetDefault', 'caSwitchTab',
    'caToggleFilter', 'caToggleSelectAll', 'ccAdmitAll', 'ccCloseFilterMenu', 'ccCopyLink', 'ccDismissStart',
    'ccEndAndNext', 'ccHold', 'ccJoin', 'ccResume', 'ccSetFilter', 'ccStartMyDay', 'ccToggleAutoPilot',
    'ccToggleFilterMenu', 'cfAddLine', 'cfClearDemo', 'cfClearRadio', 'cfDownloadPdf', 'cfLoadDemo', 'cfPrint',
    'cfRecalc', 'cfRemoveLine', 'cfSave', 'chkOnField', 'chkOpenForm', 'chkPatientInput', 'chkPatientOpenBrowse',
    'chkPatientToggle', 'chkRenderRows', 'chkSelectPatient', 'chkToggleFilter', 'clearAll',
    'clearAllDay2ResultUploads', 'clearDay2ResultUpload', 'clearDischargeDate', 'clearPatientListSearch',
    'clearPatientSection', 'closeApptModal', 'closeApptRescheduleModal', 'closeArChargeModal',
    'closeArPaymentModal', 'closeBreakBlockModal', 'closeChangePassword', 'closeForgotPassword',
    'closePatientCommentsModal', 'closePatientDocumentView', 'closePatientModal', 'closeUserMenu',
    'closeValidationModal', 'comparisonSetSide', 'comparisonSetTest', 'confirmApptReschedule', 'ctDelete',
    'ctDeleteSynced', 'ctEdit', 'ctEditSynced', 'ctExport', 'ctInviteToPortal', 'ctLinkNpi', 'ctNew',
    'ctNpiSearch', 'ctPrint', 'ctPrintCard', 'ctSaveForm', 'ctSetAlpha', 'ctSetCategory', 'ctSetColFilter',
    'ctShowTab', 'ctfPickSpeciality', 'ctgAmendClose', 'ctgAmendSubmit', 'ctgApptAlertAskDesktop',
    'ctgApptAlertDismiss', 'ctgApptAlertOpen', 'ctgCancelMfa', 'ctgClosePolicy', 'ctgConfirmResolve',
    'ctgHidePhiNotice', 'ctgOpenSpotlight', 'ctgPolicyAccept', 'ctgPolicyDecline', 'ctgPolicyToggle',
    'ctgPromptResolve', 'ctgPromptSubmit', 'ctgResendCode', 'ctgShowIf', 'ctgShowPhiNotice', 'ctgShowPolicy',
    'ctgToggleSidebarRail', 'deleteAppointment', 'deleteArCharge', 'deleteBreakBlock', 'deleteDailyNoteAtIndex',
    'deleteExamAttempt', 'deletePatient', 'deletePolicyLimit', 'deleteUploadedDocument', 'dlBasisChanged',
    'dlCloseAdd', 'dlExportCsv', 'dlOpenAdd', 'dlSubmitAdd', 'dnAmendNote', 'dnArcToggle', 'dnOnPatientSelect',
    'dnShoeboxClear', 'dnSignNote', 'dnSyncSessionDate', 'dnSyncTime', 'docFilterClear', 'docFilterSearchLive',
    'docPickFile', 'docToggleNoteField', 'downloadAceForPatient', 'downloadAllDailyNotesPdfForPatient',
    'downloadBillingStatement', 'downloadFCR', 'downloadFCRWord', 'downloadPatientExamDetailPdf', 'dpChangeMonth', 'dpClear',
    'dpSetMonth', 'dpSetYear', 'dpToday', 'editAppointment', 'editArCharge', 'editBreakBlock',
    'editDailyNoteAtIndex', 'editPatientExamFromDetail', 'encAddCharges', 'encAddPatient', 'encAlert', 'encApply',
    'encClaim', 'encClearFilter', 'encCloseIcdModal', 'encDeleteFilter', 'encExport', 'encMselOpen',
    'encMselToggle', 'encOnField', 'encOpenNote', 'encSaveFilter', 'encSaveView', 'encSelectRow', 'encSendClaim',
    'encSetDateBasis', 'encSetDefault', 'encSetRefreshTime', 'encSuperbill', 'encToggleAllCols', 'encToggleCol',
    'encToggleFilter', 'encToggleSelectAll', 'encViewIcdCodes', 'examAmend', 'examDecideAmendment',
    'examOnPatientSelect', 'examSignRecord', 'exitRegistration', 'exportFinalExamPDF', 'exportInitialExamPDF',
    'filterICD', 'goTo', 'goToFirstMissingField', 'handleAddDocumentUpload', 'handleDailyNoteShoeboxPdfUpload',
    'handleDay2ResultUpload', 'imAttachmentSelected', 'imCallAccept', 'imCallDecline', 'imCallLeave',
    'imCallSetMic', 'imCallStart', 'imCallStopScreenShare', 'imCallToggleMinimize', 'imCallToggleMute',
    'imCallToggleScreenShare', 'imCallToggleVideo', 'imCancelContext', 'imChooseAttachment',
    'imChooseConversationIcon', 'imClearAttachment', 'imCloseChatModal', 'imCloseMessageMenus',
    'imCloseMessageSearch', 'imComposerChanged', 'imComposerKeydown', 'imDeleteForMe', 'imEditMessage',
    'imHideConversation', 'imIconFileSelected', 'imInsertEmoji', 'imInsertMentionTrigger', 'imJumpToMessage',
    'imMobileBack', 'imModalMemberToggle', 'imOpenChatModal', 'imOpenConversation', 'imReact',
    'imRememberSelection', 'imRemoveConversationIcon', 'imRenderMemberPicker', 'imReplyToMessage', 'imRunUndo',
    'imSaveChatModal', 'imSearchConversations', 'imSearchMessages', 'imSelectMention', 'imSendMessage',
    'imSetDetailsMediaTab', 'imToggleDetails', 'imToggleEmojiPicker', 'imToggleFavorite', 'imToggleMessageMenu',
    'imToggleMessagePin', 'imToggleMessageSearch', 'imToggleMute', 'imToggleReactionMenu', 'imUndoUnsend',
    'imUnsendMessage', 'imUpdateMentionMenu', 'imWrapSelection', 'intakeClearMinorSignature',
    'intakeClearSignature', 'intakeMinorTouch', 'intakeOpenPreviewNewTab', 'intakePrivacyChanged',
    'intakePrivacyRefusedChanged', 'intakeRefreshMinorSigPreview', 'intakeRefreshPreviewLive',
    'intakeRefreshPreviewLiveDebounced', 'intakeSaveAllPdfs', 'intakeSaveAobLong', 'intakeSaveAobShort',
    'intakeSaveConsent', 'intakeSaveDemographics', 'intakeSaveDemographicsContinue', 'intakeSaveInsurance',
    'intakeSaveInsuranceContinue', 'intakeSaveMinorAuth', 'intakeSaveMinorAuthFields', 'intakeSavePdf',
    'intakeSelectPatient', 'intakeSignConsent', 'intakeSignMinorAuth', 'intakeSwitchTab', 'intakeToggleFormToSend',
    'intakeViewAobLong', 'intakeViewAobShort', 'intakeViewMinorAuth', 'intakeViewPdf', 'itOtherInput', 'itToggle',
    'jumpToMissingFieldAt', 'logout', 'markPatientInactive', 'msgCloseVisitTypeModal', 'msgConfirmVisitType',
    'msgCopyInviteLink', 'msgDeleteInvite', 'msgFilterPatient', 'msgOpenInviteLink', 'msgOpenPatient',
    'msgResetForm', 'msgSaveDefault', 'msgSelectPatient', 'msgSend', 'msgTemplateSub', 'msgToggleForm',
    'msgToggleTemplates', 'mtgApplyBg', 'mtgBgRemove', 'mtgBgUpload', 'mtgCancel', 'mtgChatKey', 'mtgChatSend',
    'mtgCheckStorage', 'mtgCloseDiag', 'mtgCloseLink', 'mtgCloseNew', 'mtgCloseRec', 'mtgCloseShare',
    'mtgConfirmLeave', 'mtgConfirmPresent', 'mtgCopyDiag', 'mtgCopyFromInput', 'mtgCopyLink', 'mtgCopyShare',
    'mtgCopyTranscript', 'mtgCreateShare', 'mtgDecide', 'mtgDeleteRecording', 'mtgDiagnostics', 'mtgDockDragStart',
    'mtgEndForAll', 'mtgFullscreenShare', 'mtgGoPage', 'mtgGrPick', 'mtgGrPrimary', 'mtgGrRetry', 'mtgGrRmBg',
    'mtgGrSecondary', 'mtgGrSetBg', 'mtgGrToggleCam', 'mtgGrToggleMic', 'mtgGrUpBg', 'mtgGrWhy', 'mtgGrWhyClose',
    'mtgGrWhyCopy', 'mtgGuestBg', 'mtgGuestBgRemove', 'mtgGuestBgUpload', 'mtgGuestChatKey', 'mtgGuestChatSend',
    'mtgGuestChatToggle', 'mtgGuestLeave', 'mtgGuestMoreDo', 'mtgGuestMute', 'mtgGuestNoticeClose',
    'mtgGuestPickCam', 'mtgGuestPickMic', 'mtgGuestPickSpk', 'mtgGuestSaveName', 'mtgGuestSetPane',
    'mtgGuestShare', 'mtgGuestToggleMore', 'mtgGuestVideo', 'mtgHopToNext', 'mtgInviteFromCall', 'mtgJoin',
    'mtgMarkReady', 'mtgMoreDo', 'mtgMuteEveryone', 'mtgMuteParticipant', 'mtgOpenSchedule', 'mtgPickCam',
    'mtgPickMic', 'mtgPickSpk', 'mtgPlayRecording', 'mtgPopOutShare', 'mtgRecConsentToggle', 'mtgRemoveGuest',
    'mtgRenameParticipant', 'mtgRevokeShare', 'mtgSaveTranscript', 'mtgSetPane', 'mtgSetPatientLang',
    'mtgShareRecording', 'mtgShowTranscript', 'mtgStartInstant', 'mtgStartRecording', 'mtgSubmitNew',
    'mtgToggleDock', 'mtgToggleLiveTranscript', 'mtgToggleMore', 'mtgToggleMute', 'mtgTogglePanel',
    'mtgToggleRecord', 'mtgToggleShare', 'mtgToggleSubtitles', 'mtgToggleTouch', 'mtgToggleVideo', 'mtgTranscribe',
    'nfCheckToken', 'nfLoadStatus', 'nfProbe', 'nfProbeFake', 'nfProbeKey', 'nfToggleRaw', 'notesFormEditLink',
    'notesFormLoad', 'notifSetActive', 'notifSetMedium', 'openApptModal', 'openArChargeModal',
    'openArPaymentModal', 'openBillingTableEditor', 'openChangePassword', 'openDailyNoteForPatient',
    'openExamForPatient', 'openForgotPassword', 'openPatientExamDetail', 'openPolicyLimitsManager',
    'openSectionModal', 'paDecide', 'paOpenRecord', 'paViewClose', 'paViewDecideAndClose', 'paViewOpen',
    'patientCommentsCancelEditor', 'patientCommentsDelete', 'patientCommentsEdit', 'patientCommentsSaveNote',
    'patientCommentsShowEditor', 'patientListSearchLive', 'pchrtAddDiagnosis', 'pchrtAddEntry',
    'pchrtApplyTemplate', 'pchrtCloseNoteModal', 'pchrtDxIcdInput', 'pchrtDxIcdSelect', 'pchrtEditorHtmlInput',
    'pchrtEditorInput', 'pchrtExec', 'pchrtExecVal', 'pchrtInsertMacroFrom', 'pchrtNewNote', 'pchrtOpenAce',
    'pchrtOpenNote', 'pchrtPrint', 'pchrtPull', 'pchrtRemoveDiagnosis', 'pchrtRemoveEntry', 'pchrtSaveNote',
    'pchrtSelectPatient', 'pchrtSend', 'pchrtSetMode', 'pchrtSign', 'pchrtSwitchTopTab', 'pchrtToggleSection',
    'pfBack', 'pfClearSig', 'pfNext', 'pfPrivacyAccept', 'pfPrivacyChanged', 'pfReSign', 'pfSetLang',
    'pmApplyTemplate', 'pmCallToggleKeypad', 'pmCallToggleMute', 'pmCallToggleSpeaker', 'pmCancelNote',
    'pmClearThread', 'pmComposerChanged', 'pmComposerKey', 'pmDialNumber', 'pmDispSetDir', 'pmDispSetOutcome',
    'pmEndCall', 'pmJumpToMessages', 'pmKeypadPress', 'pmMobileBack', 'pmOpenDialer', 'pmOpenPatient',
    'pmOpenPatientRecord', 'pmOpenRecordFor', 'pmSaveManualCall', 'pmSaveNote', 'pmSend', 'pmSetCallOutcome',
    'pmSetReachFilter', 'pmSetSearch', 'pmSetTab', 'pmSetTarget', 'pmSetView', 'pmStartNote', 'pmToggleDest',
    'pmToggleFav', 'pmToggleManualCall', 'pmToggleTemplates', 'pmcDeselect', 'pmcEditAddRow', 'pmcEditCancel',
    'pmcEditOpen', 'pmcEditRefresh', 'pmcEditRemoveRow', 'pmcEditSave', 'pmcSelect', 'pmcSetSearch', 'pmcSetTab',
    'policyLimitToggleDisclosed', 'prCloseAdd', 'prCloseUpdate', 'prDisagreeChanged', 'prExtendedChanged',
    'prOpenAdd', 'prOpenUpdate', 'prSetFilter', 'prStatusChanged', 'prSubmitAdd', 'prSubmitUpdate',
    'prTypeChanged', 'pregEditorClose', 'pregEditorReset', 'pregEditorSave', 'pregEditorSync', 'pregHideHoverCard',
    'pregHoverCardHover', 'pregOpenEditor', 'pregScheduleHideHoverCard', 'pregShowHoverCard',
    'proceedSaveComplete', 'proceedSaveIncomplete', 'reactivatePatient', 'removeDailyNoteShoeboxPdf',
    'removeDay2ResultUpload', 'renderBackups', 'renderContacts', 'renderDay2ResultsPreview',
    'renderPatientEncounters', 'renderPatientMessaging', 'renderPolicyLimitFormView', 'renderPolicyLimitsListView',
    'resendForgotPasswordCode', 'restoreBillingTableEdits', 'rfAccept', 'rfAnswer', 'rfBackdropClose',
    'rfCloseWizard', 'rfDateChanged', 'rfDecline', 'rfDelete', 'rfOpenPatient', 'rfOpenReferral', 'rfOpenWizard',
    'rfPickTime', 'rfRefBack', 'rfRefContinue', 'rfRefresh', 'rfRowKey', 'rfSearch', 'rfSearchClear',
    'rfSetFilter', 'rfSubmit', 'rfSubmitReferral', 'rfSyncAge', 'rfToggle', 'rfToggleTimePicker', 'rfWithdraw',
    'rlClearFilters', 'rlEditPatient', 'rlExport', 'rlGoPage', 'rlSetColFilter', 'rlSetPageSize',
    'rlSetPaymentCase', 'rlSetShowWith', 'rlSetSort', 'rlSetTag', 'rlToast', 'rlToggleLock', 'roGoTo', 'rsCopy',
    'saveAndDownloadAce', 'saveAppointment', 'saveArCharge', 'saveArPayment', 'saveBreakBlock', 'saveDailyNote',
    'saveDay1Ace', 'saveInitialExamForCurrentPatient', 'savePatientBillingStatementInfo',
    'savePatientDailyNoteDedicated', 'saveRegistration', 'searchPatientList', 'selectPatient', 'setAceScore',
    'setPatientDetailTab', 'setPatientListView', 'setReExamAsFinal', 'setYN', 'showPage',
    'stSaveGrammarDeepCheckRoles', 'stToggleGrammarDeepCheck', 'startAceForPatient', 'startDay2ForPatient',
    'startForgotPassword', 'startInitialExamForPatient', 'submitChangePassword', 'submitForgotPasswordReset',
    'syncAceNoFollowupState', 'toggleBillingRowDelete', 'toggleDatePicker', 'toggleDnShoebox', 'toggleDocGroup',
    'toggleExamPdfPanel', 'toggleFollowupFields', 'togglePatientReExamRecords', 'toggleSideGroup', 'toggleSidebar',
    'toggleTimePicker', 'toggleUserMenu', 'unsetFinalExam', 'updateBanner', 'updateBoilerplates',
    'updateExamPageLabels', 'viewBillingStatement', 'viewDailyNoteAtIndex', 'viewExamTestPdf', 'viewFCR',
    'viewPatientDocument', 'viewPatientExamResult', 'viewPatientFormDocument', 'viewSavedAceDocument',
    'wcCloseWriteOffModal', 'wcFilterGroup', 'wcFilterReason', 'wcOpenGroup', 'wcOpenReason',
    'wcOpenWriteOffModal', 'wcSelectGroup', 'wcSelectReason', 'wcSubmitWriteOff', 'wcToggleExpand', 'wcToggleRow',
    'wcToggleSelectAll', 'wcTypeChange'
  ]/*ALLOWED-END*/)
  /* load and error fire by themselves - an injected <img src=x data-onerror>
     needs no click - so they may call only what the page's own load/error
     attributes call, a far shorter list. */
  const ALLOWED_AUTO = new Set(/*AUTO-START*/[]/*AUTO-END*/)
  const AUTO_EVENTS = new Set(['load', 'error'])
  // Built-ins a handler may pass along or call (parseInt(this.value, 10)).
  const BUILTINS = new Set(['parseInt', 'parseFloat', 'Number', 'String', 'Boolean', 'isNaN', 'encodeURIComponent', 'decodeURIComponent'])
  const EVENT_METHODS = new Set(['preventDefault', 'stopPropagation', 'stopImmediatePropagation'])
  const BLOCKED_PROPS = new Set(['__proto__', 'constructor', 'prototype', '__defineGetter__', '__defineSetter__', '__lookupGetter__'])
  const EVENTS = ['click', 'change', 'input', 'submit', 'keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'dblclick',
    'contextmenu', 'focus', 'blur', 'mouseenter', 'mouseleave', 'mouseover', 'mouseout', 'load', 'error', 'dragstart',
    'dragover', 'dragenter', 'dragleave', 'drop', 'dragend', 'pointerdown', 'pointerup', 'paste', 'scroll', 'wheel',
    // Neither bubbles; fine, because each element gets its own listener. Both
    // were missed by the first conversion (<details> in Access Control, the
    // message box's text selection) and caught by the policy's own reports.
    'toggle', 'select']

  /* ---------------- reading ---------------- */

  function tokenize(src) {
    const out = []
    let i = 0
    while (i < src.length) {
      const c = src[i]
      if (/\s/.test(c)) { i++; continue }
      if (c === "'" || c === '"') {
        let j = i + 1
        let s = ''
        while (j < src.length && src[j] !== c) {
          if (src[j] === '\\' && j + 1 < src.length) {
            const n = src[j + 1]
            s += n === 'n' ? '\n' : n === 't' ? '\t' : n
            j += 2
            continue
          }
          s += src[j]
          j++
        }
        if (j >= src.length) throw new Error('unterminated text')
        out.push({ t: 'str', v: s })
        i = j + 1
        continue
      }
      const rest = src.slice(i)
      const num = /^(?:\d+(?:\.\d+)?|\.\d+)/.exec(rest)
      if (num) { out.push({ t: 'num', v: parseFloat(num[0]) }); i += num[0].length; continue }
      const id = /^[A-Za-z_$][\w$]*/.exec(rest)
      if (id) { out.push({ t: 'id', v: id[0] }); i += id[0].length; continue }
      const op = /^(?:===|!==|==|!=|<=|>=|&&|\|\||[-+*/%!<>?:.,;()[\]{}])/.exec(rest)
      if (op) { out.push({ t: 'op', v: op[0] }); i += op[0].length; continue }
      throw new Error('cannot read "' + c + '"')
    }
    return out
  }

  function parse(src) {
    const toks = tokenize(src)
    let p = 0
    const peek = (v) => toks[p] && toks[p].t === 'op' && toks[p].v === v
    const word = (v) => toks[p] && toks[p].t === 'id' && toks[p].v === v
    function take(v) {
      if (!peek(v)) throw new Error('expected "' + v + '"' + (toks[p] ? ' at "' + toks[p].v + '"' : ''))
      p++
    }

    function statements(stopAt) {
      const list = []
      while (p < toks.length && !(stopAt && peek(stopAt))) {
        if (peek(';')) { p++; continue }
        list.push(statement())
        if (p < toks.length && !peek(';') && !(stopAt && peek(stopAt))) throw new Error('unexpected "' + toks[p].v + '"')
      }
      return list
    }
    function statement() {
      if (word('return')) {
        p++
        if (p >= toks.length || peek(';') || peek('}')) return { k: 'ret', e: null }
        return { k: 'ret', e: expr() }
      }
      if (word('if')) {
        p++
        take('(')
        const c = expr()
        take(')')
        const then = block()
        let other = null
        if (word('else')) { p++; other = block() }
        return { k: 'if', c, then, other }
      }
      return { k: 'expr', e: expr() }
    }
    function block() {
      if (peek('{')) { p++; const body = statements('}'); take('}'); return body }
      return [statement()]
    }

    function expr() { return ternary() }
    function ternary() {
      const c = or()
      if (!peek('?')) return c
      p++
      const a = expr()
      take(':')
      return { k: 'cond', c, a, b: expr() }
    }
    function or() { let l = and(); while (peek('||')) { p++; l = { k: 'or', l, r: and() } } return l }
    function and() { let l = equality(); while (peek('&&')) { p++; l = { k: 'and', l, r: equality() } } return l }
    function binary(next, ops) {
      return function () {
        let l = next()
        while (toks[p] && toks[p].t === 'op' && ops.indexOf(toks[p].v) !== -1) {
          const op = toks[p++].v
          l = { k: 'bin', op, l, r: next() }
        }
        return l
      }
    }
    const mul = binary(unary, ['*', '/', '%'])
    const add = binary(mul, ['+', '-'])
    const rel = binary(add, ['<', '>', '<=', '>='])
    const equality = binary(rel, ['===', '!==', '==', '!='])
    function unary() {
      if (peek('!') || peek('-') || peek('+')) { const op = toks[p++].v; return { k: 'un', op, e: unary() } }
      if (word('typeof')) { p++; return { k: 'un', op: 'typeof', e: unary() } }
      return postfix()
    }
    function postfix() {
      let e = primary()
      for (;;) {
        if (peek('.')) {
          p++
          const t = toks[p++]
          if (!t || t.t !== 'id') throw new Error('expected a name after "."')
          e = { k: 'mem', o: e, prop: { k: 'lit', v: t.v } }
        } else if (peek('[')) {
          p++
          const key = expr()
          take(']')
          e = { k: 'mem', o: e, prop: key }
        } else if (peek('(')) {
          p++
          const args = []
          if (!peek(')')) { do { args.push(expr()) } while (peek(',') && ++p) }
          take(')')
          e = { k: 'call', f: e, args }
        } else return e
      }
    }
    function primary() {
      const t = toks[p++]
      if (!t) throw new Error('unexpected end')
      if (t.t === 'num' || t.t === 'str') return { k: 'lit', v: t.v }
      if (t.t === 'id') {
        if (t.v === 'true') return { k: 'lit', v: true }
        if (t.v === 'false') return { k: 'lit', v: false }
        if (t.v === 'null') return { k: 'lit', v: null }
        if (t.v === 'undefined') return { k: 'lit', v: undefined }
        return { k: 'id', n: t.v }
      }
      if (t.v === '(') { const e = expr(); take(')'); return e }
      if (t.v === '[') {
        const items = []
        if (!peek(']')) { do { items.push(expr()) } while (peek(',') && ++p) }
        take(']')
        return { k: 'arr', items }
      }
      if (t.v === '{') {
        const props = []
        if (!peek('}')) {
          do {
            const key = toks[p++]
            if (!key || (key.t !== 'id' && key.t !== 'str')) throw new Error('expected a property name')
            if (BLOCKED_PROPS.has(key.v)) throw new Error('refused property ' + key.v)
            take(':')
            props.push([key.v, expr()])
          } while (peek(',') && ++p)
        }
        take('}')
        return { k: 'obj', props }
      }
      throw new Error('unexpected "' + t.v + '"')
    }

    const body = statements(null)
    return body
  }

  /* What a parsed handler calls and names - the codemod checks these against
     the allowlist before it converts an attribute. */
  function inspect(body) {
    const calls = new Set()
    const names = new Set()
    const problems = []
    function walk(n) {
      if (!n || typeof n !== 'object') return
      if (Array.isArray(n)) { n.forEach(walk); return }
      if (n.k === 'call') {
        if (n.f.k === 'id') calls.add(n.f.n)
        else if (n.f.k === 'mem' && n.f.o.k === 'id' && n.f.o.n === 'event' && n.f.prop.k === 'lit' && EVENT_METHODS.has(n.f.prop.v)) { /* allowed */ }
        else problems.push('calls something other than a plain function name')
        if (n.f.k === 'mem') walk(n.f.o)
        n.args.forEach(walk)
        return
      }
      if (n.k === 'id') {
        if (n.n !== 'this' && n.n !== 'event') names.add(n.n)
        return
      }
      Object.keys(n).forEach((key) => { if (key !== 'k') walk(n[key]) })
    }
    walk(body)
    return { calls: Array.from(calls), names: Array.from(names), problems }
  }

  /* ---------------- running ---------------- */

  const RETURN = {}

  function run(body, scope) {
    for (const s of body) {
      const r = step(s, scope)
      if (r === RETURN) return scope.returned
    }
    return undefined
  }
  function step(s, scope) {
    if (s.k === 'ret') { scope.returned = s.e ? value(s.e, scope) : undefined; return RETURN }
    if (s.k === 'if') {
      const branch = value(s.c, scope) ? s.then : s.other
      if (branch) for (const inner of branch) { if (step(inner, scope) === RETURN) return RETURN }
      return null
    }
    value(s.e, scope)
    return null
  }

  function globalFunction(name, scope) {
    const list = scope && scope.auto ? ALLOWED_AUTO : ALLOWED
    if (!list.has(name) && !BUILTINS.has(name)) throw new Error('refused to call ' + name + ' (not one of the page\'s own functions)')
    const fn = root[name]
    if (typeof fn !== 'function') throw new Error(name + ' is not available on this page')
    return fn
  }

  function value(n, scope) {
    switch (n.k) {
      case 'lit': return n.v
      case 'id':
        if (n.n === 'this') return scope.el
        if (n.n === 'event') return scope.ev
        return globalFunction(n.n, scope)
      case 'mem': {
        const o = value(n.o, scope)
        const key = String(value(n.prop, scope))
        if (BLOCKED_PROPS.has(key)) throw new Error('refused property ' + key)
        return o[key]
      }
      case 'call': {
        const args = n.args.map((a) => value(a, scope))
        if (n.f.k === 'id') return globalFunction(n.f.n, scope).apply(root, args)
        if (n.f.k === 'mem' && n.f.prop.k === 'lit' && EVENT_METHODS.has(n.f.prop.v)) {
          const target = value(n.f.o, scope)
          if (target === scope.ev) return target[n.f.prop.v]()
        }
        throw new Error('refused a call that is not one of the page\'s own functions')
      }
      case 'un': {
        const v = value(n.e, scope)
        return n.op === '!' ? !v : n.op === '-' ? -v : n.op === '+' ? +v : typeof v
      }
      case 'bin': {
        const l = value(n.l, scope)
        const r = value(n.r, scope)
        switch (n.op) {
          case '+': return l + r
          case '-': return l - r
          case '*': return l * r
          case '/': return l / r
          case '%': return l % r
          case '<': return l < r
          case '>': return l > r
          case '<=': return l <= r
          case '>=': return l >= r
          case '===': return l === r
          case '!==': return l !== r
          case '==': return l == r   // eslint-disable-line eqeqeq
          case '!=': return l != r   // eslint-disable-line eqeqeq
        }
        throw new Error('operator ' + n.op)
      }
      case 'and': return value(n.l, scope) && value(n.r, scope)
      case 'or': return value(n.l, scope) || value(n.r, scope)
      case 'cond': return value(n.c, scope) ? value(n.a, scope) : value(n.b, scope)
      case 'arr': return n.items.map((i) => value(i, scope))
      case 'obj': {
        const o = {}
        n.props.forEach(([key, v]) => { o[key] = value(v, scope) })
        return o
      }
    }
    throw new Error('cannot run ' + n.k)
  }

  const compiled = new Map()
  function compile(src) {
    let body = compiled.get(src)
    if (!body) {
      body = parse(src)
      if (compiled.size > 5000) compiled.clear()
      compiled.set(src, body)
    }
    return body
  }

  function report(src, err) {
    console.error('[ctg-actions] ' + err.message + ' in: ' + String(src).slice(0, 160))
  }

  function handle(el, ev, attr) {
    const src = el.getAttribute(attr)
    if (!src) return
    let body
    try { body = compile(src) } catch (e) { report(src, e); return }
    let result
    try {
      result = run(body, { el, ev, auto: AUTO_EVENTS.has(ev.type), returned: undefined })
    } catch (e) {
      report(src, e)
      return
    }
    if (result === false && ev.cancelable) ev.preventDefault()
  }

  /* ---------------- binding ---------------- */

  function start(doc) {
    const bound = new WeakMap()
    const ATTRS = EVENTS.map((e) => 'data-on' + e)
    const SELECTOR = ATTRS.map((a) => '[' + a + ']').join(',')

    function bind(el) {
      for (let i = 0; i < EVENTS.length; i++) {
        const attr = ATTRS[i]
        if (!el.hasAttribute(attr)) continue
        let set = bound.get(el)
        if (!set) { set = new Set(); bound.set(el, set) }
        if (set.has(attr)) continue
        set.add(attr)
        el.addEventListener(EVENTS[i], (ev) => handle(el, ev, attr))
      }
    }
    function scan(node) {
      if (!node || node.nodeType !== 1) return
      bind(node)
      node.querySelectorAll(SELECTOR).forEach(bind)
    }
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'attributes') bind(m.target)
        else m.addedNodes.forEach(scan)
      }
    }).observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ATTRS })
    scan(doc.documentElement)
  }

  /* The one DOM helper the attributes use in place of an assignment: show or
     hide an element by id (a select revealing its "Other" box). */
  root.ctgShowIf = function (id, show, display) {
    const el = typeof document !== 'undefined' && document.getElementById(id)
    if (el) el.style.display = show ? (display == null ? '' : display) : 'none'
  }

  const api = { parse, inspect, compile, run, EVENTS, ALLOWED, ALLOWED_AUTO, AUTO_EVENTS, BUILTINS }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document !== 'undefined') {
    root.ctgActions = api
    start(document)
  }
})(typeof window !== 'undefined' ? window : globalThis)
