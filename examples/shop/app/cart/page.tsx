import { CartView } from "@/components/store/cart-view";
import { StoreHeader } from "@/components/store/store-header";
import { currentAccount } from "@/lib/store";

export const metadata = { title: "Basket" };

export default async function CartPage() {
  const account = await currentAccount();
  return (
    <>
      <StoreHeader />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Your basket</h1>
        <CartView signedIn={Boolean(account)} />
      </main>
    </>
  );
}
