import { describe, expect, it } from "vitest";
import {
  ACCEPTANCE,
  attachmentId,
  attachmentName,
  buildInfo,
  commitInfo,
  downloadUrl,
  fieldLabel,
  groupLinks,
  htmlToText,
  linkedIds,
  moreFields,
  parseArtifact,
  parseRelations,
  pullRequestInfo,
  richFields,
  sniffImageMime,
  toDetail,
  toolDetail,
  typeFieldNames,
  updateArgs,
  withLinkedItems,
} from "./boards";

const B = { org: "contoso", project: "Shop" };
const GUID = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0";
const ATT = `https://dev.azure.com/contoso/6d7e8f90-1111-2222-3333-444455556666/_apis/wit/attachments/${GUID}?fileName=shot.png`;

describe("attachments", () => {
  it("finds an attachment id only in the board's organisation", () => {
    expect(attachmentId(ATT, "contoso")).toBe(GUID);
    expect(attachmentId(ATT, "CONTOSO")).toBe(GUID);
    expect(attachmentId(`https://dev.azure.com/contoso/_apis/wit/attachments/${GUID}`, "contoso")).toBe(GUID);
    expect(
      attachmentId(`https://contoso.visualstudio.com/Shop/_apis/wit/attachments/${GUID}`, "contoso"),
    ).toBe(GUID);
    expect(attachmentId(ATT, "fabrikam")).toBeUndefined();
    expect(attachmentId(`https://evil.example/_apis/wit/attachments/${GUID}`, "contoso")).toBeUndefined();
    expect(
      attachmentId(`http://dev.azure.com/contoso/_apis/wit/attachments/${GUID}`, "contoso"),
    ).toBeUndefined();
    expect(
      attachmentId(`https://dev.azure.com/contoso/_apis/wit/attachments/${GUID}x`, "contoso"),
    ).toBeUndefined();
  });

  it("names an attachment and opens it as a download", () => {
    expect(attachmentName(ATT)).toBe("shot.png");
    expect(attachmentName(`${ATT.split("?")[0]}?fileName=my%20file+2.pdf`)).toBe("my file 2.pdf");
    expect(attachmentName(`https://dev.azure.com/contoso/_apis/wit/attachments/${GUID}`)).toBe(GUID);
    expect(downloadUrl({ url: ATT, name: "x" })).toBe(`${ATT}&download=true`);
    expect(downloadUrl({ url: "https://a/b", name: "notes v2.txt" })).toBe(
      "https://a/b?fileName=notes%20v2.txt&download=true",
    );
  });

  it("tells an image's type from its bytes", () => {
    expect(sniffImageMime("iVBORw0KGgoAAAANS")).toBe("image/png");
    expect(sniffImageMime("/9j/4AAQ")).toBe("image/jpeg");
    expect(sniffImageMime("R0lGODlh")).toBe("image/gif");
    expect(sniffImageMime("UklGRiQ")).toBe("image/webp");
    expect(sniffImageMime("PHN2Zz4=", "logo.svg")).toBe("image/svg+xml");
    expect(sniffImageMime("JVBERi0x", "doc.pdf")).toBeUndefined();
  });

  it("names images in plain text", () => {
    expect(
      htmlToText(`<div>Shortcut to timetable:</div><div><img src="${ATT.replace(/&/g, "&amp;")}"></div>`),
    ).toBe("Shortcut to timetable:\n[image: shot.png]");
    expect(htmlToText('<img alt="diagram" src="data:image/png;base64,AAAA">')).toBe("[image: diagram]");
    expect(htmlToText("<img src='data:image/png;base64,AAAA'>")).toBe("[image: image]");
  });
});

describe("fields", () => {
  it("labels fields from their reference names", () => {
    expect(fieldLabel("Custom.CustomerImpact")).toBe("Customer impact");
    expect(fieldLabel("Custom.Customer_ID")).toBe("Customer ID");
    expect(fieldLabel("Custom.URLToSpec")).toBe("URL to spec");
    expect(fieldLabel("Microsoft.VSTS.Common.ValueArea")).toBe("Value area");
  });

  it("reads a type's field names", () => {
    expect(
      typeFieldNames({ value: [{ referenceName: "Custom.Team", name: "Delivery team" }, { name: "x" }] }),
    ).toEqual({ "Custom.Team": "Delivery team" });
    expect(typeFieldNames(undefined)).toEqual({});
  });

  it("lists the other fields in a fixed order, custom ones by label, rich text left out", () => {
    const fields = moreFields(
      {
        "Microsoft.VSTS.Scheduling.TargetDate": "2026-12-01T00:00:00Z",
        "System.Reason": "Moved to state Active",
        "Microsoft.VSTS.Scheduling.RemainingWork": 4,
        "Microsoft.VSTS.Common.Severity": "",
        "Custom.Zone": "North",
        "Custom.Approved": true,
        "Custom.Owner": { displayName: "Ann Demo", uniqueName: "ann@contoso.com" },
        "Custom.Notes": "<div>rich</div>",
      },
      { "Custom.Zone": "Area zone" },
    );
    expect(fields.map((f) => [f.label, f.value, f.kind])).toEqual([
      ["Reason", "Moved to state Active", "text"],
      ["Remaining work", "4", "number"],
      ["Target date", "2026-12-01T00:00:00Z", "date"],
      ["Approved", "Yes", "text"],
      ["Area zone", "North", "text"],
      ["Owner", "Ann Demo", "text"],
    ]);
  });

  it("finds rich-text fields with a value, and the type's empty ones", () => {
    const { rich, empty } = richFields(
      {
        "Microsoft.VSTS.TCM.ReproSteps": "<ol><li>Open</li></ol>",
        "Custom.Notes": "<p>Note</p>",
        "Custom.N": "x",
      },
      { "Microsoft.VSTS.TCM.SystemInfo": "System Info", "Microsoft.VSTS.TCM.ReproSteps": "Repro Steps" },
    );
    expect(rich.map((r) => [r.ref, r.label, r.text])).toEqual([
      ["Microsoft.VSTS.TCM.ReproSteps", "Repro steps", "• Open"],
      ["Custom.Notes", "Notes", "Note"],
    ]);
    expect(empty).toEqual([{ ref: "Microsoft.VSTS.TCM.SystemInfo", label: "System info" }]);
  });
});

describe("development links", () => {
  const P = "6d7e8f90-1111-2222-3333-444455556666";
  const R = "a1b2c3d4-0000-1111-2222-333344445555";
  it("turns artifact links into Azure DevOps pages", () => {
    const sha = "9f8e7d6c5b4a39281706f5e4d3c2b1a098765432";
    expect(parseArtifact(`vstfs:///Git/Commit/${P}%2F${R}%2F${sha}`, "Fixed in Commit", B)).toEqual({
      kind: "commit",
      name: "Fixed in Commit",
      uri: `vstfs:///Git/Commit/${P}%2F${R}%2F${sha}`,
      ref: "9f8e7d6c",
      projectId: P,
      repoId: R,
      webUrl: `https://dev.azure.com/contoso/${P}/_git/${R}/commit/${sha}`,
    });
    expect(parseArtifact(`vstfs:///Git/PullRequestId/${P}%2F${R}%2F42`, "Pull Request", B)).toMatchObject({
      kind: "pullRequest",
      ref: "42",
      webUrl: `https://dev.azure.com/contoso/${P}/_git/${R}/pullrequest/42`,
    });
    expect(parseArtifact(`vstfs:///Git/Ref/${P}%2F${R}%2FGBfeature%2Fcheckout`, "Branch", B)).toMatchObject({
      kind: "branch",
      ref: "feature/checkout",
      webUrl: `https://dev.azure.com/contoso/${P}/_git/${R}?version=GBfeature%2Fcheckout`,
    });
    expect(parseArtifact("vstfs:///Build/Build/1234", "Build", B)).toMatchObject({
      kind: "build",
      ref: "1234",
      webUrl: "https://dev.azure.com/contoso/Shop/_build/results?buildId=1234",
    });
    expect(parseArtifact("vstfs:///Wiki/WikiPage/x", "Wiki", B)).toMatchObject({ kind: "other", ref: "x" });
    expect(parseArtifact("vstfs:///Git/Commit/%E0%A4%A", "Commit", B).kind).toBe("other");
  });

  it("reads pull requests, commits and builds best-effort", () => {
    expect(
      pullRequestInfo({ title: "Checkout", status: "active", isDraft: true, repository: { name: "web" } }),
    ).toEqual({ title: "Checkout", status: "draft", repo: "web" });
    expect(pullRequestInfo(undefined)).toEqual({});
    expect(
      commitInfo({
        comment: "Fix totals\n\nlonger",
        remoteUrl: "https://dev.azure.com/contoso/Shop/_git/My%20Repo/commit/1",
      }),
    ).toEqual({ title: "Fix totals", repo: "My Repo" });
    expect(
      buildInfo({
        buildNumber: "20261104.1",
        definition: { name: "CI" },
        status: "completed",
        result: "succeeded",
      }),
    ).toEqual({
      title: "CI 20261104.1",
      status: "succeeded",
    });
    expect(buildInfo({ status: "inProgress", result: "none" })).toEqual({ status: "inProgress" });
  });
});

describe("relations", () => {
  const relations = [
    {
      rel: "System.LinkTypes.Hierarchy-Reverse",
      url: "https://dev.azure.com/contoso/_apis/wit/workItems/10",
      attributes: { name: "Parent" },
    },
    {
      rel: "System.LinkTypes.Related",
      url: "https://dev.azure.com/contoso/_apis/wit/workItems/12",
      attributes: { name: "Related", comment: " see " },
    },
    {
      rel: "System.LinkTypes.Hierarchy-Forward",
      url: "https://dev.azure.com/contoso/_apis/wit/workItems/11",
      attributes: { name: "Child" },
    },
    { rel: "Hyperlink", url: "https://example.com/spec", attributes: { comment: "Spec" } },
    {
      rel: "AttachedFile",
      url: ATT.split("?")[0],
      attributes: {
        name: "log.txt",
        resourceSize: 2048,
        authorizedDate: "2026-11-01T10:00:00Z",
        comment: "",
      },
    },
    { rel: "ArtifactLink", url: "vstfs:///Build/Build/7", attributes: { name: "Integrated in build" } },
    {
      rel: "System.LinkTypes.Related",
      url: "https://dev.azure.com/contoso/_apis/wit/workItems/10",
      attributes: { name: "Related" },
    },
    { url: "x" },
  ];

  it("sorts relations into links, attachments and development", () => {
    const r = parseRelations(relations, B);
    expect(r.links.map((l) => [l.name, l.id, l.comment])).toEqual([
      ["Parent", 10, undefined],
      ["Related", 12, "see"],
      ["Child", 11, undefined],
      ["Hyperlink", undefined, "Spec"],
      ["Related", 10, undefined],
    ]);
    expect(r.attachments).toEqual([
      { name: "log.txt", url: ATT.split("?")[0], size: 2048, added: "2026-11-01T10:00:00Z" },
    ]);
    expect(r.development.map((d) => [d.kind, d.name])).toEqual([["build", "Integrated in build"]]);
    expect(linkedIds(r.links)).toEqual([10, 12, 11]);
    expect(parseRelations(undefined, B)).toEqual({ links: [], attachments: [], development: [] });
  });

  it("fills in linked items and groups links like Azure DevOps", () => {
    const { links } = parseRelations(relations, B);
    const filled = withLinkedItems(links, {
      value: [
        {
          id: 12,
          fields: { "System.WorkItemType": "Bug", "System.Title": "Totals wrong", "System.State": "Active" },
        },
        null,
      ],
    });
    expect(filled[1]).toMatchObject({ id: 12, type: "Bug", title: "Totals wrong", state: "Active" });
    expect(filled[0]?.title).toBeUndefined();
    expect(groupLinks(filled).map((g) => [g.name, g.links.length])).toEqual([
      ["Parent", 1],
      ["Child", 1],
      ["Related", 2],
      ["Hyperlink", 1],
    ]);
  });

  it("builds the detail with HTML beside the plain text, and a plain-text view for Claude", () => {
    const d = toDetail(
      {
        id: 5,
        fields: {
          "System.Title": "Timetable shortcut",
          "System.WorkItemType": "User Story",
          "System.State": "New",
          "System.Description": `<div>Shortcut to timetable:</div><img src="${ATT}">`,
          "System.Tags": "a; b",
        },
        relations,
      },
      B,
      {
        comments: {
          comments: [
            { text: "<b>Looks</b> good", createdBy: { displayName: "Ann" }, createdDate: "2026-11-02" },
          ],
        },
        fieldNames: { [ACCEPTANCE]: "Acceptance Criteria" },
      },
    );
    expect(d).toBeDefined();
    if (!d) return;
    expect(d.description).toBe("Shortcut to timetable:\n[image: shot.png]");
    expect(d.descriptionHtml).toContain("<img");
    expect(d.acceptanceHtml).toBe("");
    expect(d.parentId).toBe(10);
    expect(d.childIds).toEqual([11]);
    expect(d.comments).toEqual([
      { by: "Ann", at: "2026-11-02", text: "Looks good", html: "<b>Looks</b> good" },
    ]);
    const forClaude = toolDetail(d);
    expect(forClaude.descriptionHtml).toBe(d.descriptionHtml);
    expect(forClaude).not.toHaveProperty("acceptanceHtml");
    expect(forClaude).not.toHaveProperty("emptyRich");
    expect(forClaude.comments).toEqual([{ by: "Ann", at: "2026-11-02", text: "Looks good" }]);
  });

  it("leaves acceptance criteria out when the type has none", () => {
    const d = toDetail({ id: 6, fields: { "System.Title": "T" } }, B, {});
    expect(d?.acceptanceHtml).toBeUndefined();
    expect(d?.links).toEqual([]);
  });
});

describe("saving rich text", () => {
  it("sends HTML as it is and plain text as HTML", () => {
    expect(updateArgs({ descriptionHtml: '<div><img src="x"></div>' })).toEqual([
      "--description",
      '<div><img src="x"></div>',
    ]);
    expect(updateArgs({ description: "a<b" })).toEqual(["--description", "<div>a&lt;b</div>"]);
    expect(updateArgs({ acceptanceHtml: "<ul><li>ok</li></ul>" })).toEqual([
      "--fields",
      `${ACCEPTANCE}=<ul><li>ok</li></ul>`,
    ]);
    expect(updateArgs({ acceptance: "done" })).toEqual(["--fields", `${ACCEPTANCE}=<div>done</div>`]);
    expect(
      updateArgs({
        html: {
          "Microsoft.VSTS.TCM.ReproSteps": "<p>1</p>",
          "System.Description": "<p>no</p>",
          "Bad Field=x": "<p>no</p>",
        },
      }),
    ).toEqual(["--fields", "Microsoft.VSTS.TCM.ReproSteps=<p>1</p>"]);
  });
});

describe("branches", () => {
  it("reads branch names encoded once or twice", () => {
    for (const uri of ["vstfs:///Git/Ref/p%2Fr%2FGBfeature%2Fx", "vstfs:///Git/Ref/p%2Fr%2FGBfeature%252Fx"])
      expect(parseArtifact(uri, "Branch", B).ref).toBe("feature/x");
  });
});
