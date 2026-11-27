import { render } from "preact";
import { AuthGate } from "./auth";
import { CompanyWebsite } from "./components/account-pages";
import { App } from "./app";
import { prepareOfflineSupport } from "./offline";
// Use source CSS: the vendor minified file corrupts nth-child(1 of ...) selectors.
import "@salesforce-ux/design-system/assets/styles/salesforce-lightning-design-system.css";
import "./tokens.css";
import "./styles.css";

void prepareOfflineSupport();
render(window.location.pathname === "/company" ? <CompanyWebsite /> : <AuthGate><App /></AuthGate>, document.getElementById("app")!);
