import GLib from "gi://GLib"
import { Astal, Gtk } from "ags/gtk4"
import { createBinding, For, With } from "gnim"
import app from "ags/gtk4/app"
import Flames from "./Flames"

let AstalNotifd: any = null
try { AstalNotifd = (await import("gi://AstalNotifd")).default } catch (e) { }

function NotificationItem({ n }: { n: any }) {
    const summary = createBinding(n, "summary")
    const body = createBinding(n, "body")
    const appName = createBinding(n, "app-name")
    
    return (
        <box cssClasses={["notification-item"]} orientation={Gtk.Orientation.VERTICAL} spacing={4}>
            <box spacing={8}>
                <label label={appName} cssClasses={["dim", "small-text"]} hexpand halign={Gtk.Align.START} />
                <button 
                    cssClasses={["close-btn"]} 
                    onClicked={() => n.dismiss()}
                >
                    <image iconName="window-close-symbolic" pixelSize={12} />
                </button>
            </box>
            <label label={summary} cssClasses={["network-title"]} halign={Gtk.Align.START} wrap />
            <label label={body} cssClasses={["dim"]} halign={Gtk.Align.START} wrap />
            
            <With value={createBinding(n, "actions")}>
                {(actions: any[]) => {
                    if (!actions || actions.length === 0) return <box />
                    return (
                        <box spacing={8} margin-top={8}>
                            {actions.map(action => (
                                <button 
                                    cssClasses={["connect-btn"]} 
                                    hexpand 
                                    onClicked={() => n.invoke(action.id)}
                                >
                                    <label label={action.label} />
                                </button>
                            ))}
                        </box>
                    )
                }}
            </With>
        </box>
    )
}

export default function NotificationCenter() {
    if (!AstalNotifd) return <window name="notifications" visible={false} />
    const notifd = AstalNotifd.get_default()
    const notifications = createBinding(notifd, "notifications")

    return (
        <window
            name="notifications"
            cssClasses={["popup-window"]}
            application={app}
            visible={false}
            layer={Astal.Layer.OVERLAY}
            exclusivity={Astal.Exclusivity.IGNORE}
            keymode={Astal.Keymode.ON_DEMAND}
            anchor={Astal.WindowAnchor.TOP | Astal.WindowAnchor.RIGHT}
            margin-top={50}
            margin-right={10}
            $={(self) => {
                self.connect("notify::is-active", () => {
                    if (!self.is_active && self.visible) {
                        self.visible = false
                    }
                })
            }}
        >
            <box cssClasses={["notification-window"]}>
<overlay hexpand vexpand>
<Flames />
<box $type="overlay" hexpand vexpand
                    $={(self: any) => {
                        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                            const parent = self.get_parent();
                            if (parent && parent.set_measure_overlay) {
                                parent.set_measure_overlay(self, true);
                            }
                            return GLib.SOURCE_REMOVE;
                        });
                    }} orientation={Gtk.Orientation.VERTICAL} spacing={12}>
                <box halign={Gtk.Align.FILL}>
                    <label cssClasses={["network-title"]} label="Notifications" hexpand halign={Gtk.Align.START} />
                    <button 
                        cssClasses={["advanced-settings-btn"]}
                        onClicked={() => {
                            notifd.get_notifications().forEach((n: any) => n.dismiss())
                        }}
                    >
                        <label label="Clear All" />
                    </button>
                </box>
                
                <Gtk.Separator />
                
                <Gtk.ScrolledWindow
                    hscrollbarPolicy={Gtk.PolicyType.NEVER}
                    vscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}
                    maxContentHeight={400}
                    minContentHeight={200}
                    minContentWidth={350}
                >
                    <With value={notifications}>
                        {(notifs: any[]) => {
                            if (!notifs || notifs.length === 0) {
                                return (
                                    <box halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER} vexpand>
                                        <label label="No new notifications" cssClasses={["dim"]} />
                                    </box>
                                )
                            }
                            // Reverse to show newest at top (or keep as is if notifd handles it)
                            const sorted = [...notifs].reverse()
                            return (
                                <box orientation={Gtk.Orientation.VERTICAL} spacing={8}>
                                    <For each={sorted}>
                                        {(n: any) => <NotificationItem n={n} />}
                                    </For>
                                </box>
                            )
                        }}
                    </With>
                </Gtk.ScrolledWindow>
            </box>
            </overlay>
            </box>
        </window>
    )
}
