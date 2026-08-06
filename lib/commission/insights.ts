import type { CommissionRecord } from "@/lib/types";
import { commissionMonthLabel } from "@/lib/commission/demo-data";

export type CommissionFollowUpSuggestion = {
  summary: string;
  details: string[];
  actionNeeded: boolean;
};

export function getCommissionFollowUpSuggestion(
  records: CommissionRecord[],
): CommissionFollowUpSuggestion {
  const awaitingEmail = records.filter((record) => !record.emailSentAt);
  const notViewed = records.filter(
    (record) => record.emailSentAt && !record.viewedAt,
  );
  const pendingAcknowledgement = records.filter(
    (record) => record.viewedAt && !record.acknowledgedAt,
  );

  if (
    awaitingEmail.length === 0 &&
    notViewed.length === 0 &&
    pendingAcknowledgement.length === 0
  ) {
    return {
      summary: "All commission records have been acknowledged. No follow-up is needed.",
      details: ["The current commission record set has no outstanding actions."],
      actionNeeded: false,
    };
  }

  const details: string[] = [];

  if (notViewed.length > 0) {
    const departments = Array.from(
      new Set(notViewed.map((record) => record.department)),
    ).join(" and ");
    const latest = [...notViewed].sort(
      (left, right) =>
        right.commissionYear - left.commissionYear ||
        right.commissionMonth - left.commissionMonth,
    )[0];
    details.push(
      `Recommended action: send a reminder to ${departments} staff who have not viewed their ${commissionMonthLabel(latest.commissionMonth)} commission PDF.`,
    );
  }

  if (pendingAcknowledgement.length > 0) {
    details.push(
      `${pendingAcknowledgement.length} ${pendingAcknowledgement.length === 1 ? "record has" : "records have"} been viewed but still need acknowledgement.`,
    );
  }

  if (awaitingEmail.length > 0) {
    details.push(
      `${awaitingEmail.length} uploaded ${awaitingEmail.length === 1 ? "record has" : "records have"} not been marked as emailed.`,
    );
  }

  return {
    summary:
      notViewed.length > 0
        ? `${notViewed.length} ${notViewed.length === 1 ? "staff member has" : "staff have"} not viewed an emailed commission PDF.`
        : pendingAcknowledgement.length > 0
          ? `${pendingAcknowledgement.length} viewed ${pendingAcknowledgement.length === 1 ? "record needs" : "records need"} acknowledgement follow-up.`
          : `${awaitingEmail.length} uploaded ${awaitingEmail.length === 1 ? "record is" : "records are"} waiting to be emailed.`,
    details,
    actionNeeded: true,
  };
}
