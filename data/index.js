const Cu = Components.utils;
Cu.import("resource:///modules/devtools/SideMenuWidget.jsm");
Cu.import("resource:///modules/devtools/ViewHelpers.jsm");

// Listen for clicks on the first toolbar
let toolbar = document.getElementById("memtool-toolbar");
let currentView = "";
toolbar.addEventListener("click", function (event) {
  let view = event.target.getAttribute("view");
  if (view) {
    currentView = view;
    update(view);
  }
});

// Listen for clicks on the second toolbar
let actions = document.getElementById("memtool-actions");
actions.addEventListener("click", function (event) {
  let action = event.target.getAttribute("action");
  if (action == "refresh")
    update(currentView);
  else if (action)
    execute(action);
});


// Listen for clicks on the menu list
var menu = new SideMenuWidget(document.getElementById("sources"));
menu.addEventListener("click", function (e) {
  let object = e.target.object;
  if (object)
    dumpObject(object);
});


// Listen for clicks on links
let currentAnalyzer = null;
document.documentElement.addEventListener("click", function (e) {
  let a = e.target;
  if (a.tagName == "a" && a.object) {
    // Check if already inserted, remove instead of adding
    let div = a.parentNode.querySelector("div");
    if (div)
      div.parentNode.removeChild(div);
    else
      insertObject(a.parentNode, a.object, false, a.edgeName);
    // Prevent displaying an non-existant document
    e.preventDefault();
  }
}, true);

function cleanup() {
  currentAnalyzer = null;
  menu.removeAllItems();
  var container = document.getElementById("root");
  container.innerHTML = "<b>Processing memory...</b>";
}

function updateObjectList(analyzer, objects) {
  menu.removeAllItems();

  currentAnalyzer = analyzer;
  objects.forEach(function (obj) {
    let label = document.createElement("label");
    label.className = "side-menu-widget-item-label";
    label.setAttribute("crop", "start");
    label.setAttribute("flex", "1");
    let description = getObjectTitle(obj);
    if (obj.location) {
      let m = obj.location.filename.match(/\/(\w+\.\w+)$/);
      description = m[1] + ":" + obj.location.line;
    }
    label.setAttribute("value", description);
    label.object = obj;
    menu.insertItemAt(-1, label, description);
  });
  
  if (objects.length == 0)
    menu.insertItemAt(-1, "No results.");

  var container = document.getElementById("root");
  container.innerHTML = "<html:b>Done.</html:b><html:br/> &lt;---- Now select an object to inspect.";
}

function dumpObject(obj) {
  var container = document.getElementById("root");
  container.innerHTML = "";
  
  var li = document.createElementNS("http://www.w3.org/1999/xhtml", "li");
  container.appendChild(li);
  insertObject(li, obj, true, obj.edgeName);
}

function insertObject(parent, obj, printDescription, edgeName) {
  var container = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
  parent.appendChild(container);

  if (printDescription) {
    var title;
    if (obj.location)
      title = obj.location.filename + ":"+ obj.location.line;
    else
      title = getObjectTitle(obj, edgeName);

    if (title) {
      let p = document.createElementNS("http://www.w3.org/1999/xhtml", "p");
      p.classList.add("title");
      p.textContent = title;
      container.appendChild(p);
    }
  }

  if (obj.pathToFragment) {
    container.appendChild(document.createTextNode("Path to the fragment:"));
    var list = document.createElementNS("http://www.w3.org/1999/xhtml", "ul");
    obj.pathToFragment.forEach(function (o) {
      var el = document.createElementNS("http://www.w3.org/1999/xhtml", "li");
      el.classList.add("edge");
      var a = document.createElementNS("http://www.w3.org/1999/xhtml", "a");
      a.object = o.owner;
      a.textContent = getObjectTitle(o.owner);
      el.appendChild(a);
      el.appendChild(document.createTextNode("." + o.edgeName));
      list.appendChild(el);
    });
    container.appendChild(list);
  }

  let o = getObjectDescription(obj, obj.edgeName);
  if (o.kind == "scope") {
    container.appendChild(document.createElementNS("http://www.w3.org/1999/xhtml", "br"));
    var pre = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
    pre.classList.add("function-source");
    var source = o.data.source;
    source = source.replace(/&/g, '&amp;').replace(/</g, '&lt;')
                   .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
                   .replace(/'/g, '&apos;');
    source = source.replace(
      o.data.varname,
      "<span style=\"font-weight: bold;\">" + (o.data.varname) + "</span>",
      "g");
    pre.innerHTML = source;
    container.appendChild(pre);
  }

  container.appendChild(document.createElementNS("http://www.w3.org/1999/xhtml", "br"));
  container.appendChild(document.createTextNode("Being hold by:"));
  container.appendChild(document.createElementNS("http://www.w3.org/1999/xhtml", "br"));
  
  if (obj.owners.length == 0) {
    var p = document.createElementNS("http://www.w3.org/1999/xhtml", "span");
    p.innerHTML = "<b>None.</b>";
    container.appendChild(p);
  }
  else {
    var owners = document.createElementNS("http://www.w3.org/1999/xhtml", "ul");
    obj.owners.forEach(function (e) {
      var el = document.createElementNS("http://www.w3.org/1999/xhtml", "li");
      el.classList.add("owner");
      var a = document.createElementNS("http://www.w3.org/1999/xhtml", "a");
      a.object = e.from;
      a.edgeName = e.name;
      a.textContent = getObjectTitle(e.from, e.name);
      el.appendChild(a);
      el.appendChild(document.createTextNode("." + e.name ));
      owners.appendChild(el);
    });
    container.appendChild(owners);
  }

  container.appendChild(document.createElementNS("http://www.w3.org/1999/xhtml", "br"));
  
  if (o.kind == "scope") {
    container.appendChild(document.createTextNode("Scope variable being hold:"));
    container.appendChild(document.createElementNS("http://www.w3.org/1999/xhtml", "br"));
    var edges = document.createElementNS("http://www.w3.org/1999/xhtml", "ul");
    o.data.variables.forEach(function (v) {
      var el = document.createElementNS("http://www.w3.org/1999/xhtml", "li");
      el.classList.add("edge");
      el.appendChild(document.createTextNode(v.name + ": "));
      var a = document.createElementNS("http://www.w3.org/1999/xhtml", "a");
      a.object = v.target;
      a.edgeName = v.name;
      a.textContent = getObjectTitle(v.target, v.name);
      el.appendChild(a);
      edges.appendChild(el);
    });
    container.appendChild(edges);
  }
  else if (obj.edges.length == 0) {
    container.appendChild(document.createElementNS("http://www.w3.org/1999/xhtml", "br"));
    var p = document.createElementNS("http://www.w3.org/1999/xhtml", "span");
    p.innerHTML = "<b>Holding none object.</b>";
    container.appendChild(p);
  }
  else {
    container.appendChild(document.createTextNode("Holding:"));
    container.appendChild(document.createElementNS("http://www.w3.org/1999/xhtml", "br"));
    var edges = document.createElementNS("http://www.w3.org/1999/xhtml", "ul");
    obj.edges.forEach(function (e) {
      var el = document.createElementNS("http://www.w3.org/1999/xhtml", "li");
      el.classList.add("edge");
      let edgeName = getEdgePrettyName(obj, e.name, e.to);
      el.appendChild(document.createTextNode(edgeName + " = "));
      var a = document.createElementNS("http://www.w3.org/1999/xhtml", "a");
      a.object = e.to;
      a.edgeName = e.name;
      a.textContent = getObjectTitle(e.to, e.name);
      el.appendChild(a);
      edges.appendChild(el);
    });
    container.appendChild(edges);
  }
}
