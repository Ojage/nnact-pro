"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  GROWTH_CONTACT_DETAIL_KIND,
  GROWTH_PROSPECT_LIFECYCLE,
  GROWTH_PROSPECT_SOURCE,
  type GrowthContactDetailKind,
} from "@nnact/shared";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateGrowthProspectMutation,
  useGrowthDuplicateCheckQuery,
  explainRtkError,
} from "@/lib/redux/api";

interface ContactDraft {
  kind: GrowthContactDetailKind;
  value: string;
  label: string;
  source: string;
  sourceUrl: string;
}

const EMPTY_CONTACT: ContactDraft = { kind: "EMAIL", value: "", label: "", source: "", sourceUrl: "" };

export default function NewGrowthProspectPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [websiteDomain, setWebsiteDomain] = useState("");
  const [industry, setIndustry] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [equipmentNeeds, setEquipmentNeeds] = useState("");
  const [notes, setNotes] = useState("");
  const [lifecycle, setLifecycle] = useState("NEW");
  const [source, setSource] = useState("COLD_RESEARCH");
  const [countryCallingCode, setCountryCallingCode] = useState("");
  const [contacts, setContacts] = useState<ContactDraft[]>([{ ...EMPTY_CONTACT }]);
  const [force, setForce] = useState(false);

  const primaryEmail = contacts.find((c) => c.kind === "EMAIL")?.value ?? "";
  const primaryPhone = contacts.find((c) => c.kind === "PHONE")?.value ?? "";

  // The duplicate check only runs once there is something to match on, and
  // stays off the critical path otherwise.
  const duplicateArgs =
    companyName.trim() || primaryEmail.trim() || primaryPhone.trim() || websiteDomain.trim()
      ? {
          company: companyName.trim() || undefined,
          email: primaryEmail.trim() || undefined,
          phone: primaryPhone.trim() || undefined,
          domain: websiteDomain.trim() || undefined,
          countryCallingCode: countryCallingCode.trim() || undefined,
        }
      : undefined;
  const { data: duplicateCheck } = useGrowthDuplicateCheckQuery(duplicateArgs ?? { company: "__none__" }, {
    skip: !duplicateArgs,
  });
  const duplicateMatches = duplicateCheck?.matches ?? [];
  const blocked = Boolean(duplicateCheck?.blocking) && !force;

  const [createProspect, { isLoading }] = useCreateGrowthProspectMutation();

  const updateContact = (index: number, patch: Partial<ContactDraft>) => {
    setContacts((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  async function submit() {
    if (!companyName.trim()) {
      toast.error("Company name is required");
      return;
    }
    const usable = contacts.filter((c) => c.value.trim());
    try {
      const created = await createProspect({
        companyName: companyName.trim(),
        websiteDomain: websiteDomain.trim() || null,
        industry: industry.trim() || null,
        city: city.trim() || null,
        country: country.trim() || null,
        equipmentNeeds: equipmentNeeds.trim() || null,
        notes: notes.trim() || null,
        lifecycle,
        source,
        countryCallingCode: countryCallingCode.trim() || null,
        verified: false,
        force,
        contacts: usable.map((c) => ({
          kind: c.kind,
          value: c.value.trim(),
          label: c.label.trim() || null,
          source: c.source.trim() || null,
          sourceUrl: c.sourceUrl.trim() || null,
        })),
      }).unwrap();
      toast.success("Prospect added");
      router.push(`/growth/${created.id}`);
    } catch (error) {
      toast.error(explainRtkError(error, "Could not add the prospect"));
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Add prospect"
        description="Record the company and where each contact detail came from, so the research can be checked later."
      />

      <div className="space-y-6">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-fg">Company</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="companyName">Company name</Label>
              <Input
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Air Conditioning"
              />
            </div>
            <div>
              <Label htmlFor="websiteDomain">Website domain</Label>
              <Input
                id="websiteDomain"
                value={websiteDomain}
                onChange={(e) => setWebsiteDomain(e.target.value)}
                placeholder="acmeair.co.za"
              />
            </div>
            <div>
              <Label htmlFor="countryCallingCode">Country calling code</Label>
              <Input
                id="countryCallingCode"
                value={countryCallingCode}
                onChange={(e) => setCountryCallingCode(e.target.value)}
                placeholder="27"
              />
              <p className="mt-1 text-xs text-fg-muted">
                Used to match national phone numbers against existing records.
              </p>
            </div>
            <div>
              <Label htmlFor="industry">Industry</Label>
              <Input id="industry" value={industry} onChange={(e) => setIndustry(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="city">City</Label>
              <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="country">Country</Label>
              <Input id="country" value={country} onChange={(e) => setCountry(e.target.value)} />
            </div>
          </div>
        </section>

        {duplicateMatches.length > 0 ? (
          <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
            <h2 className="text-sm font-semibold text-fg">
              {duplicateCheck?.blocking ? "Possible duplicate found" : "Similar company found"}
            </h2>
            <p className="mt-1 text-xs text-fg-muted">
              {duplicateCheck?.blocking
                ? "An existing record already shares an email, domain or phone number with this prospect."
                : "Only the company name matches. This is a suggestion, not a block."}
            </p>
            <ul className="mt-3 space-y-2">
              {duplicateMatches.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/growth/${m.id}`} className="font-medium text-fg underline-offset-2 hover:underline">
                    {m.companyName}
                  </Link>
                  <span className="text-xs text-fg-dim">matched on {m.matchedOn}</span>
                </li>
              ))}
            </ul>
            {duplicateCheck?.blocking ? (
              <label className="mt-3 flex items-center gap-2 text-xs text-fg-muted">
                <input
                  type="checkbox"
                  checked={force}
                  onChange={(e) => setForce(e.target.checked)}
                />
                Create anyway — this is a different company
              </label>
            ) : null}
          </section>
        ) : null}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-fg">Contact details</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setContacts((prev) => [...prev, { ...EMPTY_CONTACT }])}
            >
              Add contact
            </Button>
          </div>
          {contacts.map((contact, index) => (
            <div key={index} className="rounded-xl border border-border p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <Select
                  value={contact.kind}
                  onValueChange={(value) => updateContact(index, { kind: value as GrowthContactDetailKind })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GROWTH_CONTACT_DETAIL_KIND.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {kind.toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="sm:col-span-3">
                  <Input
                    value={contact.value}
                    onChange={(e) => updateContact(index, { value: e.target.value })}
                    placeholder="Value"
                  />
                </div>
                <div>
                  <Input
                    value={contact.label}
                    onChange={(e) => updateContact(index, { label: e.target.value })}
                    placeholder="Role, e.g. Facilities Manager"
                  />
                </div>
                <div>
                  <Input
                    value={contact.source}
                    onChange={(e) => updateContact(index, { source: e.target.value })}
                    placeholder="Source, e.g. company website"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    value={contact.sourceUrl}
                    onChange={(e) => updateContact(index, { sourceUrl: e.target.value })}
                    placeholder="Where it was found (URL or note)"
                  />
                </div>
              </div>
              {contacts.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => setContacts((prev) => prev.filter((_, i) => i !== index))}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-fg">Context</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select value={lifecycle} onValueChange={setLifecycle}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GROWTH_PROSPECT_LIFECYCLE.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value.toLowerCase().replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GROWTH_PROSPECT_SOURCE.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value.toLowerCase().replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="equipmentNeeds">Equipment or service need</Label>
            <Textarea
              id="equipmentNeeds"
              rows={3}
              value={equipmentNeeds}
              onChange={(e) => setEquipmentNeeds(e.target.value)}
              placeholder="e.g. 3 rooftop units, no maintenance history, running since 2019"
            />
          </div>
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </section>

        <div className="flex items-center gap-2">
          <Button onClick={submit} disabled={isLoading || blocked}>
            {isLoading ? "Saving…" : "Add prospect"}
          </Button>
          <Button variant="outline" asChild>
            <Link href="/growth">Cancel</Link>
          </Button>
        </div>
        {blocked ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Resolve the duplicate above, or confirm this is a different company.
          </p>
        ) : null}
      </div>
    </div>
  );
}
