const WebKit = imports.gi.WebKit;
const session = WebKit.NetworkSession.new("/tmp/data", "/tmp/cache");
const cookieManager = session.get_cookie_manager();
cookieManager.set_persistent_storage("/tmp/data/cookies.sqlite", WebKit.CookiePersistentStorage.SQLITE);
console.log("Cookie manager success");
