import Airtable from "airtable";
import { NextResponse } from "next/server";

const BASE_ID = process.env.AIRTABLE_BASE_ID || "appRaso1tDQvVu3Ry";
const APP_BASE_URL =
  process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const TABLES = {
  awards: "tblEYOCQmY6XdhC86",
  nominations: "tblYVo7XWq6BVo9LY",
  referees: "tbl2SV7PuUpSNa7dL",
  refereeForms: "tbl7nZgFnv39FoOt7",
  cities: "tbl8lzty1gF6b9ox7",
} as const;

type RefereeInput = {
  name?: string;
  email?: string;
  phone?: string;
  relation?: string;
  relationOther?: string;
};

type SubmitPayload = {
  city?: string;
  awardCategory?: string;
  nominationDeadline?: string;
  nomineeName?: string;
  nomineeEmail?: string;
  nomineePhone?: string;
  nomineeSummary?: string;
  referees?: RefereeInput[];
};

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function extractField(record: Airtable.Record<Airtable.FieldSet>, candidates: string[]) {
  for (const fieldName of candidates) {
    const value = record.get(fieldName);
    if (value !== undefined && value !== null) {
      return String(value);
    }
  }
  return "";
}

export async function POST(request: Request) {
  const pat = process.env.AIRTABLE_PAT;

  if (!pat) {
    return NextResponse.json({ ok: false, error: "Missing AIRTABLE_PAT in environment." }, { status: 500 });
  }

  let payload: SubmitPayload;

  try {
    payload = (await request.json()) as SubmitPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  const required = {
    city: payload.city?.trim() || "",
    awardCategory: payload.awardCategory?.trim() || "",
    nominationDeadline: payload.nominationDeadline?.trim() || "",
    nomineeName: payload.nomineeName?.trim() || "",
    nomineeEmail: payload.nomineeEmail?.trim() || "",
    nomineePhone: payload.nomineePhone?.trim() || "",
    nomineeSummary: payload.nomineeSummary?.trim() || "",
  };

  const missingNomination = Object.entries(required)
    .filter(([, value]) => value.length === 0)
    .map(([key]) => key);

  if (missingNomination.length > 0) {
    return NextResponse.json(
      { ok: false, error: "All nomination fields are required.", missingFields: missingNomination },
      { status: 400 },
    );
  }

  const referees = payload.referees || [];
  if (referees.length !== 2) {
    return NextResponse.json(
      { ok: false, error: "Exactly two referees are required." },
      { status: 400 },
    );
  }

  const hasMissingReferee = referees.some((referee) => {
    const relation = referee.relation?.trim() || "";
    const baseMissing =
      !(referee.name?.trim()) ||
      !(referee.email?.trim()) ||
      !(referee.phone?.trim()) ||
      !relation;
    const missingOther = relation === "Other" && !(referee.relationOther?.trim());
    return baseMissing || missingOther;
  });

  if (hasMissingReferee) {
    return NextResponse.json(
      { ok: false, error: "All referee contact fields are required." },
      { status: 400 },
    );
  }

  try {
    const base = new Airtable({ apiKey: pat }).base(BASE_ID);

    const [cities, awards, nominations] = await Promise.all([
      base(TABLES.cities).select({ view: "Grid view" }).all(),
      base(TABLES.awards).select({ view: "Grid view" }).all(),
      base(TABLES.nominations).select({ view: "Grid view" }).all(),
    ]);

    const cityRecord = cities.find(
      (record) => normalizeText(String(record.get("City Name") || "")) === normalizeText(required.city),
    );

    if (!cityRecord) {
      return NextResponse.json({ ok: false, error: "Selected city was not found in Airtable." }, { status: 400 });
    }

    const awardRecord = awards.find((record) => {
      const awardName = normalizeText(String(record.get("Award Name") || ""));
      const cityIds = (record.get("City") as string[] | undefined) || [];
      const matchesName = awardName === normalizeText(required.awardCategory);
      const matchesCity = cityIds.length === 0 || cityIds.includes(cityRecord.id);
      return matchesName && matchesCity;
    });

    if (!awardRecord) {
      return NextResponse.json(
        { ok: false, error: "Selected award category was not found for the selected city." },
        { status: 400 },
      );
    }

    const targetName = normalizeText(required.nomineeName);
    const targetEmail = normalizeText(required.nomineeEmail);
    const targetPhone = normalizePhone(required.nomineePhone);

    const duplicate = nominations.find((record) => {
      const recordName = normalizeText(extractField(record, ["Nominee Name", "Name", "Nominee"]));
      const recordEmail = normalizeText(
        extractField(record, ["Nominee Email", "Email", "Email Address"]),
      );
      const recordPhone = normalizePhone(
        extractField(record, ["Nominee Phone", "Phone", "Phone Number"]),
      );

      const duplicateByName = targetName.length > 0 && recordName === targetName;
      const duplicateByEmail = targetEmail.length > 0 && recordEmail.length > 0 && recordEmail === targetEmail;
      const duplicateByPhone = targetPhone.length > 0 && recordPhone.length > 0 && recordPhone === targetPhone;

      return duplicateByName || duplicateByEmail || duplicateByPhone;
    });

    if (duplicate) {
      const existingNomineeName = extractField(duplicate, ["Nominee Name", "Name", "Nominee"]) || "Unknown Nominee";
      const awardLookup =
        extractField(duplicate, ["Award Name (Lookup)", "Award", "Award Category"]) || "Unknown Award";
      const cityLookup =
        extractField(duplicate, ["City Name (Lookup)", "City", "City Name"]) || "Unknown City";

      return NextResponse.json(
        {
          ok: false,
          error:
            `Duplicate nominee found by email, phone, or name. Existing nomination: ${existingNomineeName} (${awardLookup}, ${cityLookup}). ` +
            "One nominee can only be nominated once and only for one award.",
        },
        { status: 409 },
      );
    }

    const nominationResponses = [
      `Nominee Email: ${required.nomineeEmail}`,
      `Nominee Phone: ${required.nomineePhone}`,
      `Referral Deadline: ${required.nominationDeadline}`,
      "",
      required.nomineeSummary,
    ].join("\n");

    const nominationCreate = await base(TABLES.nominations).create({
      "Nominee Name": required.nomineeName,
      City: [cityRecord.id],
      Award: [awardRecord.id],
      "Nomination Form Responses": nominationResponses,
      "Submission Date": new Date().toISOString().slice(0, 10),
      "Nomination Status": "In Progress",
    });

    const refereeCreates = await base(TABLES.referees).create(
      referees.map((referee) => ({
        fields: {
          "Full Name": referee.name?.trim() || "",
          "Email Address": referee.email?.trim() || "",
          "Phone Number": referee.phone?.trim() || "",
          "Affiliation or Organization":
            referee.relation === "Other"
              ? `Relation: Other (${referee.relationOther?.trim() || ""})`
              : `Relation: ${referee.relation?.trim() || ""}`,
          Nomination: [nominationCreate.id],
        },
      })),
    );

    const refereeForms = await base(TABLES.refereeForms).create(
      refereeCreates.map((refereeRecord) => ({
        fields: {
          Name: `${String(refereeRecord.get("Full Name") || "Referee")} - Referee Statement`,
          Nomination: [nominationCreate.id],
          Referee: [refereeRecord.id],
          "Submission Status": "Not Started",
          Deadline: required.nominationDeadline,
        },
      })),
    );

    await Promise.all(
      refereeForms.map((refereeForm) =>
        base(TABLES.refereeForms).update(refereeForm.id, {
          Link: `${APP_BASE_URL}/referee/${refereeForm.id}`,
        }),
      ),
    );

    return NextResponse.json({
      ok: true,
      nominationId: nominationCreate.id,
      refereeIds: refereeCreates.map((record) => record.id),
      refereeFormIds: refereeForms.map((record) => record.id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to submit nomination to Airtable.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
