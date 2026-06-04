import app from "ags/gtk4/app"
import style from "./style.scss"
import Bar from "./widget/TopBar/Bar"
import BatteryBar from "./widget/BatteryBar/Bar"
import ChatWindow from "./widget/AIChat/ChatWindow"

app.start({
  css: style,
  main() {
    app.get_monitors().map(Bar)
    app.get_monitors().map(BatteryBar)
    ChatWindow()
  },
})
