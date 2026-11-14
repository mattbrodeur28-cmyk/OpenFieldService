import { render } from "preact";
import { AuthGate } from "./auth";
import { CompanyWebsite } from "./components/account-pages";
import { App } from "./app";
import { prepareOfflineSupport } from "./offline";
import "./tokens.css";
import "./styles.css";

void prepareOfflineSupport();
render(window.location.pathname === "/company" ? <CompanyWebsite /> : <AuthGate><App /></AuthGate>, document.getElementById("app")!);
