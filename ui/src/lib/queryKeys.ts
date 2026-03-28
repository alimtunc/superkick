export const queryKeys = {
  runs: {
    all: ["runs"] as const,
    detail: (id: string) => ["runs", id] as const,
  },
};
