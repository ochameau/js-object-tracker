 let { Cc, Ci, Cu } = require("chrome")
let { gDevTools } = Cu.import("resource:///modules/devtools/gDevTools.jsm", {})
let self = require("sdk/self")
let l10n = require("sdk/l10n")
 
let ioService = Cc["@mozilla.org/network/io-service;1"].
    getService(Ci.nsIIOService)
 
function nsIURI(uri) {
  return ioService.newURI(uri, null, null)
}
 
function grantPrivileges(uri) {
  Cc["@mozilla.org/permissionmanager;1"].
    getService(Ci.nsIPermissionManager).
    add(nsIURI(uri), 'allowXULXBL', Ci.nsIPermissionManager.ALLOW_ACTION);
}
 
function revokePrivileges(uri) {
  Cc["@mozilla.org/permissionmanager;1"].
    getService(Ci.nsIPermissionManager).
    remove(nsIURI(uri), 'allowXULXBL', Ci.nsIPermissionManager.ALLOW_ACTION);
}
 
function registerTool(options) {
  gDevTools.registerTool({
    id: options.id + self.id,
    icon: self.data.url(options.icon),
    url: options.url,
    label: l10n.get(options.label),
    tooltip: l10n.get(options.tooltip),
    isTargetSupported: function(target) {
      return !target.isRemote;
    },
    build: options.build
  })
}
exports.register = registerTool;
 
function unregisterTool(id) {
  gDevTools.unregisterTool(id + self.id)
}
exports.unregister = unregisterTool;
