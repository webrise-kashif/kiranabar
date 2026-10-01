/**
 * Identifies whose cart is being operated on -- exactly one of `userId`/
 * `guestToken` is ever set (a logged-in customer or an anonymous guest,
 * never both, and possibly neither for a first-time visitor who hasn't
 * added anything yet). Never spread this into a Prisma `where` clause
 * directly: an `undefined` field value is Prisma's "don't filter on this",
 * not "IS NULL" -- doing so could match an unrelated cart. Always branch
 * explicitly (see CartService's private lookup helpers).
 */
export interface CartOwner {
  userId?: string;
  guestToken?: string;
}
