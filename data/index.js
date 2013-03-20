
var menu = new SideMenuWidget(document.getElementById("sources"));
menu.addEventListener("click", function (e) {
  let object = e.target.object;
  if (object)
    dumpObject(object);
  else if (e.target.tagName == "label")
    update();
});

function updateObjectList(objects) {
  menu.removeAllItems();
  menu.insertItemAt(-1, " -- update -- ");

  objects.forEach(function (obj) {
    let label = document.createElement("label");
    label.className = "side-menu-widget-item-label";
    label.setAttribute("crop", "start");
    label.setAttribute("flex", "1");
    label.setAttribute(
      "value",
      obj.filename.match(/\/(\w+\.\w+)$/)[1] + ":" + obj.line);
    label.object = obj;
    menu.insertItemAt(-1, label, obj.filename);
  });

  var container = document.getElementById("root");
  container.innerHTML = "<html:b>Done.</html:b><html:br/> &lt;---- Now select an object to inspect.";
}

function dumpObject(obj) {
  var container = document.getElementById("root");
  container.innerHTML = "";

  var li = document.createElement("li");
  var name = document.createTextNode(obj.name + " @ " + obj.filename + ":"+ obj.line);
  li.appendChild(name);
  var owners = document.createElementNS("http://www.w3.org/1999/xhtml", "ul");
  obj.owners.forEach(function (o) {
    var el = document.createElementNS("http://www.w3.org/1999/xhtml", "li");
    if (o.kind == "scope") {
      var desc = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
      desc.textContent = "Referenced by scope:";
      el.appendChild(desc);
      var pre = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
      pre.style.whiteSpace = "pre";
      pre.style.background = "#f0f0f0";
      pre.style.border = "1px solid #e0e0e0";
      var source = o.data.source.replace(
        o.data.varname,
        "<span style=\"font-weight: bold;\">" + o.data.varname + "</span>",
        "g");
      pre.innerHTML = source;
      el.appendChild(pre);
    }
    else if (o.kind == "generic") {
      el.innerHTML = "Simple reference:<br/>" + o.data + " = " + o.name;
    }
    owners.appendChild(el);
  })
  li.appendChild(owners);
  container.appendChild(li);
}
