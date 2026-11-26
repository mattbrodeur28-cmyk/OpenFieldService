export const dateLabel = (value: string) =>
  value
    ? new Date(
        value.length === 10
          ? value + "T12:00:00"
          : value.replace(" ", "T") + "Z",
      ).toLocaleString(
        undefined,
        value.length === 10
          ? { month: "short", day: "numeric", year: "numeric" }
          : {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            },
      )
    : "Not set";

/** Completed elapsed periods as of the server read; never local-time calendar days. */
export function stageAge(timing?: {status:string;elapsedMinutes:number|null}) {
 if(!timing || timing.status !== 'known' || timing.elapsedMinutes === null) return 'Stage age unavailable';
 const minutes=timing.elapsedMinutes;
 if(minutes<60)return `${minutes}m in stage`;
 if(minutes<1440)return `${Math.floor(minutes/60)}h in stage`;
 return `${Math.floor(minutes/1440)}d in stage`;
}
