import React from "react";
import { fill, strings } from "../i18n";
import { Notice, NoticeCard } from "./NoticeCard";

type Props = {
  /**
   * How many whole days old the orbits being drawn are, or `null` while they
   * are current. See `useLiveCatalog`.
   */
  staleDays: number | null;
};

/**
 * Says that the sky is being drawn from orbits that are out of date.
 *
 * Which happens when CelesTrak could not be reached — no signal, the service
 * down, the address blocked — and the app opened on an old cache or on the
 * catalogue it shipped with (`bundledCatalog.ts`). The satellites are still
 * roughly where they are drawn, which is exactly what makes it worth a line:
 * a marker a few degrees off looks like a marker, and nothing else on screen
 * would say it is not.
 *
 * Nothing to do about it but wait, and the sentence says as much — the view is
 * already asking CelesTrak again on its own (`refreshStaleCatalog`), and the
 * notice takes itself away when an answer lands.
 */
export const CatalogNotice: React.FC<Props> = ({ staleDays }) => {
  const notice = noticeFor(staleDays);
  return notice ? <NoticeCard notice={notice} /> : null;
};

function noticeFor(staleDays: number | null): Notice | null {
  if (staleDays === null) return null;
  const words = strings().catalogNotice;
  const age = staleDays <= 1 ? words.oneDay : fill(words.days, { days: staleDays });
  return { title: words.stale.title, detail: fill(words.stale.detail, { age }) };
}

export default CatalogNotice;
