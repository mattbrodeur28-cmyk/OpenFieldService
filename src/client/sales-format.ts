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
