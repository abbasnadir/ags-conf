import app from "ags/gtk4/app"
import style from "./style.scss"
import Bar from "./widget/TopBar/Bar"
import BatteryBar from "./widget/BatteryBar/Bar"
import ChatWindow from "./widget/AIChat/ChatWindow"
import CalendarWindow from "./widget/TopBar/Calendar"
import NetworkWindow from "./widget/TopBar/Network"
import BluetoothWindow from "./widget/TopBar/Bluetooth"

app.start({
  css: style,
  main() {
    Bar()
    app.get_monitors().map(BatteryBar)
    ChatWindow()
    CalendarWindow()
    NetworkWindow()
    BluetoothWindow()
  },
})
