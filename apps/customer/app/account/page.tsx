import { CustomerFooter, CustomerHeader } from "@/components/customer-chrome";
import { CustomerAccount } from "@/components/customer-account";

export const metadata = {
  title: "My account | NNACT",
  description: "Track service appointments, estimates, invoices, equipment and documents.",
};

export default function AccountPage() {
  return (
    <div className="min-h-screen bg-surface-100">
      <CustomerHeader compact />
      <main className="mx-auto w-[min(1080px,calc(100%-32px))] py-10">
        <CustomerAccount />
      </main>
      <CustomerFooter />
    </div>
  );
}
