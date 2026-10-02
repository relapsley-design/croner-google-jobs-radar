(() => {
  "use strict";

  const state = {
    leads: [],
    saved: JSON.parse(localStorage.getItem("cronerRadar") || "{}"),
    current: null
  };

  const $ = (id) => document.getElementById(id);

  const els = {
    mode: $("mode"),
    location: $("location"),
    custom: $("custom"),
    search: $("search"),
    count: $("count"),
    hot: $("hot"),
    saved: $("saved"),
    filter: $("filter"),
    export: $("export"),
    settings: $("settings"),
    keybox: $("keybox"),
    apiKey: $("apiKey"),
    saveKey: $("saveKey"),
    status: $("status"),
    results: $("results"),
    dialog: $("dialog"),
    detail: $("detail")
  };

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  }

  function safeId(value) {
    return String(value)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 100);
  }

  function persistSaved() {
    localStorage.setItem("cronerRadar", JSON.stringify(state.saved));
  }

  function setStatus(message, type = "") {
    els.status.textContent = message;
    els.status.dataset.type = type;
  }

  function render() {
    const query = (els.filter.value || "").trim().toLowerCase();

    const visible = state.leads.filter((x) => {
      const haystack = [
        x.company,
        x.title,
        x.location,
        ...(x.signals || [])
      ].join(" ").toLowerCase();

      return haystack.includes(query);
    });

    els.count.textContent = state.leads.length;
    els.hot.textContent =
      state.leads.filter((x) => x.score >= 70).length;
    els.saved.textContent =
      Object.keys(state.saved).length;

    if (!visible.length) {
      els.results.innerHTML =
        '<div class="empty">No prospects found.</div>';
      return;
    }

    els.results.innerHTML = visible.map((x) => {
      const id = safeId(x.id);

      return `
        <article class="card">
          <div class="top">
            <div>
              <div class="company">${esc(x.company)}</div>
              <div class="title">${esc(x.title)}</div>
            </div>
            <span class="score">${x.score}</span>
          </div>

          <div class="meta">
            ${esc(x.location)}
            ${x.posted ? ` · ${esc(x.posted)}` : ""}
          </div>

          <div class="chips">
            ${(x.signals || [])
              .map((s) => `<span class="chip">${esc(s)}</span>`)
              .join("")}
          </div>

          <div class="why">
            <b>Why it surfaced</b><br>
            ${esc((x.signals || []).join(", "))}
          </div>

          <div class="actions">
            <button type="button"
              data-action="view"
              data-id="${id}">
              View
            </button>

            <button type="button"
              data-action="toggle"
              data-id="${id}">
              ${state.saved[x.id] ? "Saved ✓" : "Save"}
            </button>

            <a
              class="dark"
              href="${esc(x.url || "#")}"
              target="_blank"
              rel="noopener noreferrer">
              Job
            </a>
          </div>
        </article>
      `;
    }).join("");
  }

  function analyse(job) {
    const title = String(job.title || "");
    const text =
      `${title} ${job.description || ""}`.toLowerCase();

    let score = 0;
    const signals = [];

    if (/first\s+(hr|people|human resources)/.test(text)) {
      score += 42;
      signals.push("First HR/People hire");
    }

    if (
      /(build|establish|create|set up|from scratch)/.test(text) &&
      /(hr|human resources|people)/.test(text)
    ) {
      score += 25;
      signals.push("Build HR function");
    }

    if (/standalone|sole|only hr|only people/.test(text)) {
      score += 22;
      signals.push("Standalone HR");
    }

    if (/founder|ceo|chief executive/.test(text)) {
      score += 10;
      signals.push("CEO/founder proximity");
    }

    if (/growing|growth|scale|scaling/.test(text)) {
      score += 6;
      signals.push("Growth signal");
    }

    if (
      /hr manager|people manager|head of people|hr lead/
        .test(title.toLowerCase())
    ) {
      score += 12;
      signals.push("HR/People leadership title");
    }

    return {
      score: Math.min(99, score),
      signals: signals.length
        ? signals
        : ["HR hiring signal"]
    };
  }

  function jobToLead(job, fallbackLocation) {
    const analysis = analyse(job);

    const company =
      job.company_name || "Unknown company";

    const title =
      job.title || "HR role";

    const location =
      job.location ||
      fallbackLocation ||
      "United Kingdom";

    const id =
      job.job_id ||
      `${company}|${title}|${location}`;

    return {
      id,
      company,
      title,
      location,
      posted:
        job.detected_extensions?.posted_at || "",
      score: analysis.score,
      signals: analysis.signals,
      url:
        job.share_link ||
        job.apply_options?.[0]?.link ||
        "#",
      desc: job.description || "",
      source: "Google Jobs"
    };
  }

  async function requestJobs(
    query,
    location,
    apiKey
  ) {
    const url =
      new URL("https://serpapi.com/search.json");

    url.searchParams.set(
      "engine",
      "google_jobs"
    );

    url.searchParams.set("q", query);
    url.searchParams.set(
      "location",
      location
    );
    url.searchParams.set("gl", "uk");
    url.searchParams.set("hl", "en");
    url.searchParams.set(
      "google_domain",
      "google.co.uk"
    );
    url.searchParams.set(
      "api_key",
      apiKey
    );

    let response;

    try {
      response = await fetch(
        url.toString(),
        {
          method: "GET",
          headers: {
            "Accept": "application/json"
          }
        }
      );
    } catch (error) {
      throw new Error(
        "The Google Jobs request could not be reached from this browser."
      );
    }

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error(
        `SerpApi returned an invalid response (HTTP ${response.status}).`
      );
    }

    if (!response.ok || data.error) {
      throw new Error(
        data.error ||
        `SerpApi request failed (HTTP ${response.status}).`
      );
    }

    return data.jobs_results || [];
  }

  async function run() {
    const apiKey =
      localStorage.getItem("serpapiKey");

    if (!apiKey) {
      els.keybox.hidden = false;
      els.mode.textContent = "NO KEY";

      setStatus(
        "Enter your SerpApi key first.",
        "error"
      );

      els.apiKey.focus();
      return;
    }

    const location =
      (els.location.value ||
        "United Kingdom").trim();

    const custom =
      (els.custom.value || "").trim();

    const queries = custom
      ? [custom]
      : [
          "first HR hire",
          "first HR manager",
          "first People hire",
          "first People Manager",
          "build HR function",
          "establish HR function",
          "standalone HR manager",
          "sole HR manager",
          "HR function from scratch",
          "build people function"
        ];

    els.search.disabled = true;
    els.mode.textContent = "SEARCHING";

    setStatus(
      "Searching Google Jobs..."
    );

    try {
      const all = [];

      for (const query of queries) {
        const jobs = await requestJobs(
          query,
          location,
          apiKey
        );

        jobs.forEach((job) => {
          all.push(
            jobToLead(job, location)
          );
        });
      }

      const byCompany = new Map();

      for (const lead of all) {
        const key =
          lead.company
            .trim()
            .toLowerCase();

        if (
          !byCompany.has(key) ||
          lead.score >
            byCompany.get(key).score
        ) {
          byCompany.set(key, lead);
        }
      }

      state.leads =
        [...byCompany.values()]
          .sort(
            (a, b) =>
              b.score - a.score
          );

      els.mode.textContent = "LIVE";

      render();

      setStatus(
        `${state.leads.length} company prospects found.`
      );

    } catch (error) {
      els.mode.textContent = "ERROR";

      setStatus(
        error.message ||
        "Search failed. Try again.",
        "error"
      );

    } finally {
      els.search.disabled = false;
    }
  }

  function toggleSaved(id) {
    if (state.saved[id]) {
      delete state.saved[id];
    } else {
      state.saved[id] = {
        note: ""
      };
    }

    persistSaved();
    render();
  }

  function openLead(id) {
    const lead =
      state.leads.find(
        (x) => safeId(x.id) === id
      );

    if (!lead) return;

    state.current = lead;

    const note =
      state.saved[lead.id]?.note || "";

    els.detail.innerHTML = `
      <div class="detail">

        <h2>${esc(lead.company)}</h2>

        <div class="title">
          ${esc(lead.title)}
        </div>

        <p>
          ${esc(lead.location)}
        </p>

        <div class="chips">
          ${(lead.signals || [])
            .map(
              (s) =>
                `<span class="chip">${esc(s)}</span>`
            )
            .join("")}
        </div>

        <h3>Why this is worth calling</h3>

        <p>
          ${esc(lead.desc).slice(0, 1800)}
        </p>

        <h3>Croner opener</h3>

        <div class="script">
          “Hi, I’m calling from Croner.
          I noticed you’re recruiting for
          ${esc(lead.title)}.
          I was interested because it looks
          like you’re putting dedicated
          HR/People resource in place.
          What prompted the hire, and have
          you already got your HR policies,
          employment support and day-to-day
          infrastructure covered?”
        </div>

        <h3>Notes</h3>

        <textarea
          id="note"
          class="note"
          aria-label="Notes"
        >${esc(note)}</textarea>

      </div>

      <button
        type="button"
        class="save"
        id="saveNoteButton">
        Save notes
      </button>
    `;

    $("saveNoteButton")
      .addEventListener(
        "click",
        saveNote
      );

    els.dialog.showModal();
  }

  function saveNote() {
    if (!state.current) return;

    state.saved[state.current.id] = {
      note:
        $("note")?.value || ""
    };

    persistSaved();

    els.dialog.close();

    render();
  }

  function exportCsv() {
    const savedLeads =
      state.leads.filter(
        (x) => state.saved[x.id]
      );

    if (!savedLeads.length) {
      window.alert(
        "Save prospects first."
      );
      return;
    }

    const rows = [
      [
        "Company",
        "Role",
        "Location",
        "Posted",
        "Score",
        "Signals",
        "Job URL"
      ]
    ];

    savedLeads.forEach((x) => {
      rows.push([
        x.company,
        x.title,
        x.location,
        x.posted,
        x.score,
        (x.signals || []).join("; "),
        x.url
      ]);
    });

    const csv =
      rows.map(
        (row) =>
          row
            .map(
              (value) =>
                `"${String(value ?? "")
                  .replace(/"/g, '""')}"`
            )
            .join(",")
      ).join("\r\n");

    const blob =
      new Blob(
        [csv],
        {
          type:
            "text/csv;charset=utf-8"
        }
      );

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;

    link.download =
      "croner-google-job-prospects.csv";

    document.body.appendChild(link);

    link.click();

    link.remove();

    setTimeout(
      () =>
        URL.revokeObjectURL(url),
      1000
    );
  }

  function setup() {

    els.settings.addEventListener(
      "click",
      () => {

        els.keybox.hidden =
          !els.keybox.hidden;

        els.apiKey.value =
          localStorage.getItem(
            "serpapiKey"
          ) || "";

        if (!els.keybox.hidden) {

          setStatus(
            "Paste your SerpApi key, then tap Save key."
          );

          els.apiKey.focus();
        }
      }
    );

    els.saveKey.addEventListener(
      "click",
      () => {

        const key =
          els.apiKey.value.trim();

        if (!key) {

          setStatus(
            "Please enter your SerpApi key first.",
            "error"
          );

          els.apiKey.focus();

          return;
        }

        localStorage.setItem(
          "serpapiKey",
          key
        );

        els.keybox.hidden = true;

        els.mode.textContent =
          "READY";

        setStatus(
          "Key saved. Tap Find prospects."
        );
      }
    );

    els.search.addEventListener(
      "click",
      run
    );

    els.filter.addEventListener(
      "input",
      render
    );

    els.export.addEventListener(
      "click",
      exportCsv
    );

    els.results.addEventListener(
      "click",
      (event) => {

        const button =
          event.target.closest(
            "[data-action]"
          );

        if (!button) return;

        const id =
          button.dataset.id;

        if (
          button.dataset.action ===
          "view"
        ) {
          openLead(id);
        }

        if (
          button.dataset.action ===
          "toggle"
        ) {

          const lead =
            state.leads.find(
              (x) =>
                safeId(x.id) === id
            );

          if (lead) {
            toggleSaved(lead.id);
          }
        }
      }
    );

    render();
  }

  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      setup,
      { once: true }
    );

  } else {

    setup();

  }

})();
