/**
 * Meta Embedded Signup (v4) through the Facebook JS SDK.
 * https://developers.facebook.com/docs/whatsapp/embedded-signup/implementation
 *
 * - FB.login with the Facebook Login for Business configuration returns a `code` (valid ~30s).
 * - The popup posts a `WA_EMBEDDED_SIGNUP` message with the selected WABA and phone number.
 */

interface FbLoginResponse {
  authResponse?: { code?: string } | null;
  status?: string;
}

interface FacebookSdk {
  init(options: { appId: string; autoLogAppEvents?: boolean; xfbml?: boolean; version: string }): void;
  login(callback: (response: FbLoginResponse) => void, options: Record<string, unknown>): void;
}

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

export interface SessionInfo {
  event: string;
  wabaId?: string;
  phoneNumberId?: string;
  businessId?: string;
  errorMessage?: string;
  currentStep?: string;
}

let sdkPromise: Promise<FacebookSdk> | null = null;

export function loadFacebookSdk(appId: string, version: string): Promise<FacebookSdk> {
  sdkPromise ??= new Promise((resolve, reject) => {
    if (window.FB) {
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      resolve(window.FB);
      return;
    }
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      resolve(window.FB!);
    };
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error('Could not load the Facebook SDK. Check that connect.facebook.net is not blocked.'));
    };
    document.body.appendChild(script);
  });
  return sdkPromise;
}

/** Listens for the WA_EMBEDDED_SIGNUP session info message from the popup. */
export function listenForSessionInfo(onInfo: (info: SessionInfo) => void) {
  const handler = (event: MessageEvent) => {
    if (!event.origin.endsWith('facebook.com')) return;
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
      onInfo({
        event: data.event,
        wabaId: data.data?.waba_id,
        phoneNumberId: data.data?.phone_number_id,
        businessId: data.data?.business_id,
        errorMessage: data.data?.error_message,
        currentStep: data.data?.current_step,
      });
    } catch {
      // Other facebook.com messages are not JSON; ignore them.
    }
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

export function launchEmbeddedSignup(sdk: FacebookSdk, configId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    sdk.login(
      (response) => {
        const code = response.authResponse?.code;
        if (code) resolve(code);
        else reject(new Error('Signup was cancelled or did not return an authorization code.'));
      },
      {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: {} },
      },
    );
  });
}
