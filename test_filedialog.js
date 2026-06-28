const Gtk = imports.gi.Gtk;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;

Gtk.init();
const dialog = new Gtk.FileDialog();
// We won't actually open it to block, just check if it instantiates
console.log("FileDialog instantiated");
