import Link from "next/link";
import { ShoppingBagIcon, UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listCategories, currentAccount } from "@/lib/store";
import { CartCount } from "./cart-count";

/**
 * The shop's own header: what's for sale, the basket, and who you are.
 *
 * Separate from the dashboard's chrome on purpose — a customer has no business seeing
 * the admin's navigation, and the shop front should look like a shop.
 */
export async function StoreHeader() {
  const [categories, account] = await Promise.all([listCategories(), currentAccount()]);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6">
        <Link href="/" className="font-semibold tracking-tight">
          shop
        </Link>

        <nav className="hidden flex-1 items-center gap-5 text-sm md:flex">
          <Link href="/products" className="text-muted-foreground hover:text-foreground">
            All products
          </Link>
          {categories.map((category) => (
            <Link key={category.id} href={`/categories/${category.slug}`} className="text-muted-foreground hover:text-foreground">
              {category.name}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" asChild aria-label={account ? "Your orders" : "Sign in"}>
            <Link href={account ? "/account/orders" : "/sign-in"}>
              <UserIcon />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" asChild aria-label="Basket" className="relative">
            <Link href="/cart">
              <ShoppingBagIcon />
              <CartCount />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
