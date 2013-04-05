const { components, Cu } = require("chrome");

////////////
// "mem" API
const trackedObjects = [];
const trackedMetadata = [];
function track(obj) {
  // Keep a weak ref to this object
  let weak = Cu.getWeakReference(obj);
  trackedObjects.push(weak);

  // And also store some additional metadata
  let frame = components.stack.caller;
  trackedMetadata.push({
    location: {
      filename: frame.filename,
      line: frame.lineNumber
    }
  });
}


////////////////////////////////////
// Inject `mem` in content documents
const systemEvents = require('sdk/system/events');
const unload = require("sdk/system/unload");

function onContentWindow(event) {
  let document = event.subject;
  if (!document.defaultView)
    return;
  let window = document.defaultView;
  // Only inject if not already existing
  if ("mem" in window.wrappedJSObject)
    return;
  let mem = Cu.createObjectIn(window);
  Object.defineProperties(mem, {
    track: {
      value: track
    },
    __exposedProps__: {
      value: {
        "track": "r"
      }
    }
  });
  Cu.makeObjectPropsNormal(mem);
  window.wrappedJSObject.mem = mem;
}

systemEvents.on('document-element-inserted', onContentWindow, true);
unload.when(function () {
  systemEvents.off('document-element-inserted', onContentWindow);
});

exports.getTrackedObjects = function () {
  return trackedObjects;
}

exports.getObjectMetadata = function (i) {
  return trackedMetadata[i];
}
