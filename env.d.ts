declare const SRC: string

declare module "inline:*" {
  const content: string
  export default content
}

declare module "*.scss" {
  const content: string
  export default content
}

declare module "*.blp" {
  const content: string
  export default content
}

declare module "*.css" {
  const content: string
  export default content
}

declare module "gi://WebKit?version=6.0" {
  import Gtk from "gi://Gtk?version=4.0"

  namespace WebKit {
    class WebView extends Gtk.Widget {
      uri: string | null

      can_go_back(): boolean
      go_back(): void
      load_uri(uri: string): void
      reload(): void
    }
  }

  const WebKit: {
    WebView: typeof WebKit.WebView
  }

  export default WebKit
}
