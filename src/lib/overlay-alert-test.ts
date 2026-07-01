export const OVERLAY_ALERT_TEST_CHANNEL = "songpix-overlay-alert-test";
export const OVERLAY_ALERT_TEST_STORAGE_KEY = "songpix-overlay-alert-test";

export type OverlayAlertTestPayload = {
  id: string;
  name: string;
  title: string;
  amountCents: number;
  thumb: string | null;
};

export type OverlayAlertTestMessage = {
  type: "overlay-alert-test";
  slug: string;
  alert: OverlayAlertTestPayload;
  ts: number;
};

export function makeOverlayAlertTestMessage(slug: string, roomName?: string): OverlayAlertTestMessage {
  return {
    type: "overlay-alert-test",
    slug,
    ts: Date.now(),
    alert: {
      id: `overlay-test-${Date.now()}`,
      name: "Teste SongPIX",
      title: roomName ? `Boost de teste em ${roomName}` : "Boost de teste no overlay",
      amountCents: 1500,
      thumb: null,
    },
  };
}

export function dispatchOverlayAlertTest(message: OverlayAlertTestMessage) {
  let delivered = false;

  if (typeof window !== "undefined" && "BroadcastChannel" in window) {
    const channel = new BroadcastChannel(OVERLAY_ALERT_TEST_CHANNEL);
    channel.postMessage(message);
    channel.close();
    delivered = true;
  }

  if (typeof window !== "undefined" && "localStorage" in window) {
    window.localStorage.setItem(OVERLAY_ALERT_TEST_STORAGE_KEY, JSON.stringify(message));
    delivered = true;
  }

  return delivered;
}
