"use client";

import { useEffect, useMemo, useState } from "react";

type NominationFormState = {
  city: string;
  awardCategory: string;
  nominationDeadline: string;
  nomineeName: string;
  nomineeEmail: string;
  nomineePhone: string;
  nomineeSummary: string;
};

type RefereeContact = {
  name: string;
  email: string;
  phone: string;
  relation: string;
  relationOther: string;
};

type AwardOption = {
  id: string;
  name: string;
  cityIds: string[];
  active: boolean;
};

type AirtableBootstrap = {
  baseId: string;
  tables: {
    awards: string;
    nominations: string;
    referees: string;
    refereeForms: string;
    cities: string;
  };
  cities: Array<{ id: string; name: string }>;
  awards: Array<{ id: string; name: string; cityIds: string[]; active: boolean }>;
  refereesCount: number;
  refereeFormsCount: number;
  refereeFormsSubmitted: number;
};

const fallbackAwards = [
  "Community Leadership",
  "Business Excellence",
  "Arts and Culture",
  "Health and Wellness",
  "Youth Inspiration",
  "Lifetime Contribution",
].map((name) => ({
  id: name,
  name,
  cityIds: [],
  active: true,
}));

const relationOptions = [
  "Colleague",
  "Mentor",
  "Community Member",
  "Friend",
  "Other",
];

const emptyReferee: RefereeContact = {
  name: "",
  email: "",
  phone: "",
  relation: "",
  relationOther: "",
};

export default function NominationsFrontend() {
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState("");

  const [cityOptions, setCityOptions] = useState<Array<{ id: string; name: string }>>([
    { id: "calgary", name: "Calgary" },
    { id: "edmonton", name: "Edmonton" },
  ]);
  const [awardOptions, setAwardOptions] = useState<AwardOption[]>(fallbackAwards);

  const [nominationForm, setNominationForm] = useState<NominationFormState>({
    city: "",
    awardCategory: "",
    nominationDeadline: "",
    nomineeName: "",
    nomineeEmail: "",
    nomineePhone: "",
    nomineeSummary: "",
  });
  const [nominationError, setNominationError] = useState("");
  const [finalSubmitting, setFinalSubmitting] = useState(false);

  const [referees, setReferees] = useState<RefereeContact[]>([
    { ...emptyReferee },
    { ...emptyReferee },
  ]);
  const [refereeError, setRefereeError] = useState("");
  const [finalSubmitted, setFinalSubmitted] = useState(false);

  const cityIdByName = useMemo(() => {
    return Object.fromEntries(cityOptions.map((city) => [city.name, city.id]));
  }, [cityOptions]);

  const filteredAwards = useMemo(() => {
    const selectedCityId = cityIdByName[nominationForm.city] || "";
    return awardOptions.filter((award) => {
      if (!award.active) {
        return false;
      }
      if (!selectedCityId || award.cityIds.length === 0) {
        return true;
      }
      return award.cityIds.includes(selectedCityId);
    });
  }, [awardOptions, cityIdByName, nominationForm.city]);

  useEffect(() => {
    async function loadBootstrap() {
      try {
        setBootstrapLoading(true);
        const response = await fetch("/api/airtable/bootstrap", { cache: "no-store" });
        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload?.error || "Failed to load Airtable data.");
        }

        const payload = (await response.json()) as AirtableBootstrap;

        if (payload.cities.length > 0) {
          setCityOptions(payload.cities.filter((city) => city.name.trim().length > 0));
        }

        if (payload.awards.length > 0) {
          setAwardOptions(payload.awards.filter((award) => award.name.trim().length > 0));
        }

        setBootstrapError("");
      } catch (error) {
        setBootstrapError(error instanceof Error ? error.message : "Failed to load Airtable data.");
      } finally {
        setBootstrapLoading(false);
      }
    }

    loadBootstrap();
  }, []);

  useEffect(() => {
    if (!nominationForm.awardCategory) {
      return;
    }

    const exists = filteredAwards.some((award) => award.name === nominationForm.awardCategory);
    if (!exists) {
      setNominationForm((current) => ({ ...current, awardCategory: "" }));
    }
  }, [filteredAwards, nominationForm.awardCategory]);

  async function submitAll() {
    setNominationError("");
    setRefereeError("");

    const values = Object.values(nominationForm).map((value) => value.trim());
    const hasEmpty = values.some((value) => value.length === 0);

    if (hasEmpty) {
      setNominationError("All nomination fields are required.");
      return;
    }

    const hasMissingReferee = referees.some((referee) => {
      const baseMissing =
        referee.name.trim().length === 0 ||
        referee.email.trim().length === 0 ||
        referee.phone.trim().length === 0 ||
        referee.relation.trim().length === 0;
      const missingOther = referee.relation === "Other" && referee.relationOther.trim().length === 0;
      return baseMissing || missingOther;
    });

    if (hasMissingReferee) {
      setRefereeError("All referee contact fields are required.");
      return;
    }

    try {
      setFinalSubmitting(true);
      const response = await fetch("/api/airtable/nominations/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...nominationForm,
          referees,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        setNominationError(payload.error || "Nomination validation failed.");
        return;
      }

      setFinalSubmitted(true);
    } catch (error) {
      setNominationError(
        error instanceof Error ? error.message : "Nomination validation failed.",
      );
    } finally {
      setFinalSubmitting(false);
    }
  }

  function autofillTestData() {
    const defaultCity = cityOptions[0]?.name || "Calgary";
    const awardsForCity = awardOptions.filter((award) => {
      if (!award.active) {
        return false;
      }
      const cityId = cityIdByName[defaultCity] || "";
      return !cityId || award.cityIds.length === 0 || award.cityIds.includes(cityId);
    });
    const defaultAward = awardsForCity[0]?.name || awardOptions[0]?.name || "";

    setNominationForm({
      city: defaultCity,
      awardCategory: defaultAward,
      nominationDeadline: "2026-03-31",
      nomineeName: "Test Nominee",
      nomineeEmail: "test.nominee@example.com",
      nomineePhone: "403-555-0199",
      nomineeSummary:
        "This is test data for validating the nomination and referee workflow end-to-end.",
    });

    setReferees([
      {
        name: "Referee One",
        email: "bartekkowalski465@gmail.com",
        phone: "403-555-0111",
        relation: "Colleague",
        relationOther: "",
      },
      {
        name: "Referee Two",
        email: "bartekkowalski925@gmail.com",
        phone: "780-555-0222",
        relation: "Mentor",
        relationOther: "",
      },
    ]);

    setNominationError("");
    setRefereeError("");
  }

  return (
    <main className="nominations-page">
      <div className="hero-bg" />
      <section className="hero-card">
        <p className="kicker">South Asian Inspirational Awards</p>
        <h1>Nomination & Referee Workflow</h1>
        <p>
          Frontend prototype for Calgary and Edmonton nominations. Airtable/email
          steps are represented in UI only.
        </p>
        <button type="button" className="outline-btn" onClick={autofillTestData}>
          Autofill Test Data
        </button>
      </section>

      {finalSubmitted && (
        <section className="panel success-box">
          <h2>Nomination Submitted</h2>
          <p>
            Thank you for your nomination. The submission has been received successfully.
          </p>
          <p className="muted">
            Our team will review the nomination and contact referees using the referral process.
          </p>
        </section>
      )}

      {!finalSubmitted && (
        <>
      <section className="panel">
        <h2>1. Nominee Submission</h2>
        <p className="supporting-text">
          Select city and award category, then submit nominee details.
        </p>

        {bootstrapLoading && <p className="supporting-text">Loading Airtable data...</p>}
        {bootstrapError && <p className="error-text">Airtable load failed: {bootstrapError}</p>}
        <div className="form-grid">
          <div className="field-group">
            <span className="field-label">City</span>
            <div className="radio-row">
              {cityOptions.map((city) => (
                <label key={city.id}>
                  <input
                    type="radio"
                    name="city"
                    checked={nominationForm.city === city.name}
                    onChange={() =>
                      setNominationForm((current) => ({
                        ...current,
                        city: city.name,
                        awardCategory: "",
                      }))
                    }
                  />
                  {city.name}
                </label>
              ))}
            </div>
          </div>

          <label>
            Award category
            <select
              value={nominationForm.awardCategory}
              onChange={(event) =>
                setNominationForm((current) => ({
                  ...current,
                  awardCategory: event.target.value,
                }))
              }
            >
              <option value="">Select category</option>
              {filteredAwards.map((category) => (
                <option key={category.id} value={category.name}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Referral deadline
            <input
              type="date"
              value={nominationForm.nominationDeadline}
              onChange={(event) =>
                setNominationForm((current) => ({
                  ...current,
                  nominationDeadline: event.target.value,
                }))
              }
            />
          </label>

          <label>
            Nominee full name
            <input
              type="text"
              value={nominationForm.nomineeName}
              onChange={(event) =>
                setNominationForm((current) => ({
                  ...current,
                  nomineeName: event.target.value,
                }))
              }
              placeholder="Full name"
            />
          </label>

          <label>
            Nominee email
            <input
              type="email"
              value={nominationForm.nomineeEmail}
              onChange={(event) =>
                setNominationForm((current) => ({
                  ...current,
                  nomineeEmail: event.target.value,
                }))
              }
              placeholder="name@example.com"
            />
          </label>

          <label>
            Nominee phone
            <input
              type="tel"
              value={nominationForm.nomineePhone}
              onChange={(event) =>
                setNominationForm((current) => ({
                  ...current,
                  nomineePhone: event.target.value,
                }))
              }
              placeholder="###-###-####"
            />
          </label>

          <label className="full-row">
            Why is this nominee inspirational?
            <textarea
              rows={4}
              value={nominationForm.nomineeSummary}
              onChange={(event) =>
                setNominationForm((current) => ({
                  ...current,
                  nomineeSummary: event.target.value,
                }))
              }
              placeholder="Share impact and contribution"
            />
          </label>

          {nominationError && <p className="error-text">{nominationError}</p>}
        </div>
      </section>

      <section className="panel">
        <h2>2. Referee Contact Details</h2>
        <p className="supporting-text">
          Collect two referees.
        </p>

        <div className="form-grid">
          {referees.map((referee, index) => (
            <div key={`referee-contact-${index}`} className="referee-block">
              <h3>Referee {index + 1}</h3>
              <label>
                Full name
                <input
                  type="text"
                  value={referee.name}
                  onChange={(event) =>
                    setReferees((current) =>
                      current.map((item, i) =>
                        i === index ? { ...item, name: event.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={referee.email}
                  onChange={(event) =>
                    setReferees((current) =>
                      current.map((item, i) =>
                        i === index ? { ...item, email: event.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Phone
                <input
                  type="tel"
                  value={referee.phone}
                  onChange={(event) =>
                    setReferees((current) =>
                      current.map((item, i) =>
                        i === index ? { ...item, phone: event.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Relation to nominee
                <select
                  value={referee.relation}
                  onChange={(event) =>
                    setReferees((current) =>
                      current.map((item, i) =>
                        i === index
                          ? {
                              ...item,
                              relation: event.target.value,
                              relationOther: event.target.value === "Other" ? item.relationOther : "",
                            }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="">Select relation</option>
                  {relationOptions.map((relation) => (
                    <option key={relation} value={relation}>
                      {relation}
                    </option>
                  ))}
                </select>
              </label>
              {referee.relation === "Other" && (
                <label>
                  Other relation details
                  <input
                    type="text"
                    value={referee.relationOther}
                    onChange={(event) =>
                      setReferees((current) =>
                        current.map((item, i) =>
                          i === index ? { ...item, relationOther: event.target.value } : item,
                        ),
                      )
                    }
                    placeholder="Add more context"
                  />
                </label>
              )}
            </div>
          ))}

          {refereeError && <p className="error-text">{refereeError}</p>}
        </div>
      </section>

      <section className="panel">
        <button
          type="button"
          className="primary-btn"
          disabled={finalSubmitting || finalSubmitted}
          onClick={submitAll}
        >
          {finalSubmitted ? "Submitted" : finalSubmitting ? "Submitting..." : "Submit Nomination"}
        </button>
        {finalSubmitted && (
          <p className="success-text">
            Nomination package submitted successfully.
          </p>
        )}
      </section>
        </>
      )}

    </main>
  );
}
