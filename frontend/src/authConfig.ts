import type { Configuration, PopupRequest } from "@azure/msal-browser";

export const msalConfig: Configuration = {
  auth: {
    clientId: "346ab166-f55d-4e2a-942a-5e6a035bde73",
    authority: "https://login.microsoftonline.com/5552ca21-1b6a-4283-9e5f-f659668e7674",
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "sessionStorage",
  },
};

export const loginRequest: PopupRequest = {
  scopes: ["User.Read"],
};

export const API_BASE_URL = "https://func-docucolab-dev.azurewebsites.net/api";
