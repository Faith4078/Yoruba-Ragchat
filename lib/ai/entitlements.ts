type Entitlements = {
  maxMessagesPerHour: number;
};

// With Clerk as the sole auth provider there is a single class of
// authenticated user, so entitlements are no longer keyed by user type.
export const entitlements: Entitlements = {
  maxMessagesPerHour: 10,
};
