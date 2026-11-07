import { describe, expect, it } from "vitest";
import {
  areaClause,
  type BoardColumn,
  boardQuery,
  boardTenant,
  boardTitle,
  boardUrl,
  cardDone,
  chatDraft,
  columnField,
  initials,
  orgName,
  personEmail,
  placeCards,
  tabName,
  teamApi,
  toColumns,
  toWorkItem,
  type WorkItem,
} from "./boards";

const where = { org: "contoso", project: "Shop", team: "Shop Team", boardName: "Stories" };
const BOARD = {
  columns: [
    {
      id: "c1",
      name: "New",
      columnType: "incoming",
      itemLimit: 0,
      stateMappings: { "User Story": "New", Bug: "New" },
    },
    {
      id: "c2",
      name: "Doing",
      columnType: "inProgress",
      itemLimit: 5,
      stateMappings: { "User Story": "Active", Bug: "Active" },
    },
    {
      id: "c3",
      name: "Closed",
      columnType: "outgoing",
      itemLimit: 0,
      stateMappings: { "User Story": "Closed", Bug: "Closed" },
    },
  ],
  fields: { columnField: { referenceName: "WEF_1_Kanban.Column" } },
};

describe("links and names", () => {
  it("builds the team API, board link and titles", () => {
    expect(teamApi(where)).toBe("https://dev.azure.com/contoso/Shop/Shop%20Team/_apis/work");
    expect(boardUrl(where)).toBe("https://dev.azure.com/contoso/Shop/_boards/board/t/Shop%20Team/Stories");
    expect(boardTitle(where)).toBe("Shop Team · Stories");
    expect(tabName({ ...where, name: "Stories" })).toBe("Shop Team · Stories");
    expect(tabName({ ...where, name: "Sprint board" })).toBe("Sprint board");
    expect(orgName("https://dev.azure.com/contoso")).toBe("contoso");
    expect(orgName("https://fabrikam.visualstudio.com/")).toBe("fabrikam");
  });
});

describe("toColumns and columnField", () => {
  it("reads a board's columns and its column field", () => {
    const cols = toColumns(BOARD);
    expect(cols.map((c) => c.name)).toEqual(["New", "Doing", "Closed"]);
    expect(cols[1]?.itemLimit).toBe(5);
    expect(columnField(BOARD)).toBe("WEF_1_Kanban.Column");
    expect(toColumns(null)).toEqual([]);
    expect(columnField({})).toBeUndefined();
  });
});

describe("areaClause and boardQuery", () => {
  it("turns the team's areas into a condition", () => {
    expect(
      areaClause({
        field: { referenceName: "System.AreaPath" },
        values: [
          { value: "Shop\\Web", includeChildren: true },
          { value: "Ann's", includeChildren: false },
        ],
      }),
    ).toBe("([System.AreaPath] UNDER 'Shop\\Web' OR [System.AreaPath] = 'Ann''s')");
    expect(areaClause({ values: [] })).toBeUndefined();
  });
  it("asks for the board's types, keeps old done cards off and reads the column field", () => {
    const q = boardQuery(
      toColumns(BOARD) as BoardColumn[],
      "([System.AreaPath] UNDER 'Shop')",
      "WEF_1_Kanban.Column",
    );
    expect(q).toContain("[System.WorkItemType] IN ('User Story', 'Bug')");
    expect(q).toContain("UNDER 'Shop'");
    expect(q).toContain("[System.State] NOT IN ('Closed') OR [System.ChangedDate] >= @today - 30");
    expect(q).toContain("[WEF_1_Kanban.Column]");
    // By name, not @project: az with a project name that has a space finds nothing otherwise.
    expect(boardQuery(toColumns(BOARD) as BoardColumn[], undefined, undefined, "Shop's Web")).toContain(
      "[System.TeamProject] = 'Shop''s Web'",
    );
  });
});

describe("toWorkItem and placeCards", () => {
  it("reads rows and places cards in their column, by state when the column is missing", () => {
    const item = toWorkItem(
      {
        id: 7,
        fields: {
          "System.Title": "Checkout",
          "System.WorkItemType": "Bug",
          "System.State": "Active",
          "System.AssignedTo": { displayName: "Ann Demo", uniqueName: "ann@example.com" },
          "WEF_1_Kanban.Column": "Doing",
        },
      },
      where,
      "WEF_1_Kanban.Column",
    );
    expect(item).toMatchObject({ id: 7, column: "Doing", assignedTo: "Ann Demo" });
    expect(item?.url).toBe("https://dev.azure.com/contoso/Shop/_workitems/edit/7");
    expect(
      toWorkItem({ id: 8, fields: { "System.AssignedTo": "Ann Demo <a@example.com>" } }, where)?.assignedTo,
    ).toBe("Ann Demo");
    expect(item?.assignedEmail).toBe("ann@example.com");
    expect(personEmail("Ann Demo <a@example.com>")).toBe("a@example.com");
    expect(personEmail({ displayName: "Build", uniqueName: "Build\\Shop" })).toBeUndefined();
    expect(personEmail(undefined)).toBeUndefined();
    expect(toWorkItem(null, where)).toBeUndefined();

    const byState: WorkItem = { id: 9, title: "t", type: "User Story", state: "Closed", url: "" };
    const lanes = placeCards({ columns: toColumns(BOARD), items: [item as WorkItem, byState] });
    expect(lanes.map((l) => l.items.map((i) => i.id))).toEqual([[], [7], [9]]);
  });
});

describe("small helpers", () => {
  it("initials and the chat draft", () => {
    expect(initials("Ann Demo")).toBe("AD");
    expect(initials("ann")).toBe("A");
    expect(chatDraft({ id: 7, title: "Checkout", type: "Bug", state: "Active", url: "u" })).toContain(
      "Bug #7: Checkout",
    );
  });
});

describe("boardTenant", () => {
  it("is the tenant a board was followed in, your own az login for older boards", () => {
    expect(boardTenant({ tenant: "contoso" })).toBe("contoso");
    expect(boardTenant({})).toBe("default");
  });
});

describe("cardDone", () => {
  const cols: BoardColumn[] = [
    { id: "a", name: "To do", columnType: "incoming", itemLimit: 0, stateMappings: { Task: "To Do" } },
    { id: "b", name: "Doing", columnType: "inProgress", itemLimit: 0, stateMappings: { Task: "Doing" } },
    { id: "c", name: "Shipped", columnType: "outgoing", itemLimit: 0, stateMappings: { Task: "Finished" } },
  ];
  it("is done in the last column, its state, or a finished state", () => {
    expect(cardDone(cols, { type: "Task", state: "Doing", column: "Shipped" })).toBe(true);
    expect(cardDone(cols, { type: "Task", state: "Finished" })).toBe(true);
    expect(cardDone(cols, { type: "Issue", state: "Closed" })).toBe(true);
    expect(cardDone(cols, { type: "Task", state: "Doing", column: "Doing" })).toBe(false);
    expect(cardDone([], { type: "Task", state: "To Do" })).toBe(false);
  });
});
