/** Triggers são instalados em ação manual separada e nunca no deploy. */

function HKGK_installStagingTriggers() {
  var config = hkgkGetConfig_();
  if (config.env !== 'staging' || !config.dryRun || config.clinicalMode !== 'disabled') {
    throw hkgkError_('TRIGGER_STAGING_GATE_FAILED', '', '', false);
  }
  var desired = {
    HKGK_scanInboxTick: 10,
    HKGK_dispatchTick: 5,
    HKGK_watchdogTick: 10
  };
  var existing = ScriptApp.getProjectTriggers();
  Object.keys(desired).forEach(function(handler) {
    var duplicates = existing.filter(function(trigger) { return trigger.getHandlerFunction() === handler; });
    duplicates.slice(1).forEach(function(trigger) { ScriptApp.deleteTrigger(trigger); });
    if (!duplicates.length) ScriptApp.newTrigger(handler).timeBased().everyMinutes(desired[handler]).create();
  });
  return HKGK_listOwnedTriggers();
}

function HKGK_removeOwnedTriggers() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (String(trigger.getHandlerFunction() || '').indexOf('HKGK_') !== 0) return;
    ScriptApp.deleteTrigger(trigger);
    removed++;
  });
  return { removed: removed, at: hkgkNowIso_() };
}

function HKGK_listOwnedTriggers() {
  return ScriptApp.getProjectTriggers().filter(function(trigger) {
    return String(trigger.getHandlerFunction() || '').indexOf('HKGK_') === 0;
  }).map(function(trigger) {
    return { id: trigger.getUniqueId(), handler: trigger.getHandlerFunction(), source: String(trigger.getTriggerSource()) };
  });
}
