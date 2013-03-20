/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Jetpack.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Atul Varma <atul@mozilla.com>
 *   Alexandre Poirot <poirot.alex@gmail.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

let {Cc, Ci, Cr} = require("chrome");

const { Class } = require('sdk/core/heritage');
const xpcom = require("sdk/platform/xpcom");
const ios = Cc["@mozilla.org/network/io-service;1"]
            .getService(Ci.nsIIOService);
const SimpleURI = Cc["@mozilla.org/network/simple-uri;1"];

exports.register = function register(name, url) {
  let contractID = "@mozilla.org/network/protocol;1?name=" + name;
  let base = ios.newURI(url, null, null);
  let principal = Cc["@mozilla.org/systemprincipal;1"].createInstance(Ci.nsIPrincipal);

  let ProtocolHandler = Class({
    extends: xpcom.Unknown,
    interfaces: ["nsISupports", "nsISupportsWeakReference",
                 "nsIProtocolHandler"],
    get scheme() {
      return name;
    },
    get protocolFlags() {
      // Same flag than chrome protocol
      return  Ci.nsIProtocolHandler.URI_STD |
              Ci.nsIProtocolHandler.URI_IS_UI_RESOURCE |
              Ci.nsIProtocolHandler.URI_IS_LOCAL_RESOURCE;
    },
    get defaultPort() {
      return -1;
    },
    allowPort: function allowPort() {
      return false;
    },
    newURI: function newURI(spec, charset, baseURI) {
      try {
        var uri = SimpleURI.createInstance(Ci.nsIURI)
        if (spec.indexOf( name + ":") == -1 ) {
          uri.spec = name + ":/" + spec;
        } else {
          uri.spec = spec;
        }
        return uri.QueryInterface(Ci.nsIURI);
      } catch(e) {
        console.log("Exception during newURI :\n"+e);
      }
    },
    newChannel: function newChannel(URI) {
      try {
        let resolved;
        if (URI.spec.indexOf(name + ':/') == 0)
          resolved = ios.newURI(URI.path.replace(/^\/+/, ""), null, base);
        else
          resolved = ios.newURI(URI.path, null, base);
        var channel = ios.newChannelFromURI(resolved);

        // Do same things than chrome protocol:
        channel.owner = principal;
        channel.loadFlags &= ~Ci.nsIChannel.LOAD_REPLACE;
        channel.originalURI = URI;

        return channel;
      } catch(e) {
        console.log("Exception during newChannel :\n"+e);
      }
      throw Cr.NS_ERROR_FILE_NOT_FOUND;
    }
  });

  let factory = xpcom.Factory({
    Component: ProtocolHandler,
    description: "Chrome protocol: " + name,
    contract: contractID
  });
};
