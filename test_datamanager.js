const WebKit = imports.gi.WebKit;
const session = WebKit.NetworkSession.new("/tmp/data", "/tmp/cache");
const dm = session.get_website_data_manager();
console.log("Data manager exists:", dm !== null);
