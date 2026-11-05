import { describe, expect, it } from "vitest";
import { VOICE_COMMANDS } from "./grammar";
import { afterWake, cleanWords, learnedStart, matchName, matchWake, nameScore, parseCommand } from "./match";

const id = (text: string) => parseCommand(text)?.command.id;
const slots = (text: string) => parseCommand(text)?.slots;

describe("afterWake", () => {
  it("finds the command after Hey Jig, however Whisper spells it", () => {
    expect(afterWake("Hey Jig, open a new chat.")).toBe("open a new chat");
    expect(afterWake("Hey, Jigg. What's happening?")).toBe("what is happening");
    expect(afterWake("OK gig run the tests")).toBe("run the tests");
    expect(afterWake("Hey Jig.")).toBe("");
  });
  it("ignores speech that isn't for Jig", () => {
    expect(afterWake("I was thinking about the jig saw")).toBeUndefined();
    expect(afterWake("you")).toBeUndefined();
    expect(afterWake("Jig, new chat")).toBeUndefined();
    expect(afterWake("Jig, new chat", true)).toBe("new chat");
  });
});

/**
 * What Whisper (small, as in the app) wrote for "Hey Jig …" and for other speech, said by Windows'
 * voices including a Spanish-accented one (D-389). Each line is a real transcription.
 */
const HEARD_AS_HEY_JIG = [
  "Hey jig, what's happening?",
  "Hey jig open a new chair",
  "Hey Jig. What's happening?",
  "Hey, big, what's happening?",
  "Hey, Geek, open a new chat.",
  "OK, big test.",
  "Hey, big, stop listening.",
  "Hey jig",
  "heyjig",
  "Hey G.",
  "Hey jeep, new chat",
];
const NOT_FOR_JIG = [
  "Hey Jake, how are you?",
  "Hey hake, how are you?",
  "Hey, did you see the email?",
  "Hey, give me that.",
  "Hey there, what's up?",
  "I was talking about the jigsaw.",
  "That's a big deal.",
  "A big deal.",
  "We have a gig tonight",
  "Hey Jack, come here.",
  "Hey Jim, nice to see you.",
  "Hey guys, dinner is ready.",
  "Hey Siri, set a timer.",
  "Hey, just a second.",
  "Hey Jeff, are you there?",
  "Okay, jeez, fine.",
  "Hi, Jill, how was it?",
  "Yo, check this out.",
  "Hijack the meeting",
  "Hey, you",
];

describe("matchWake", () => {
  it.each(HEARD_AS_HEY_JIG)("hears “%s” as Hey Jig", (text) => {
    expect(matchWake(text).rest).toBeDefined();
  });
  it.each(NOT_FOR_JIG)("doesn't wake on “%s”", (text) => {
    expect(matchWake(text).rest).toBeUndefined();
  });
  it("says how it was found, or why not", () => {
    expect(matchWake("Hey jig, new chat")).toEqual({
      rest: "new chat",
      via: "spelling",
      reason: "“hey jig”",
    });
    expect(matchWake("Hey, Geek, new chat").via).toBe("sounds-like");
    expect(matchWake("Hey Jake").reason).toBe("“hey” then “jake”, not Jig");
    expect(matchWake("").reason).toBe("Nothing was heard");
    expect(matchWake("Hey").reason).toBe("Only “hey”");
    expect(matchWake("Talking about jigs").reason).toBe("Starts with “talking about”, not Hey Jig");
  });
  it("hears your trained starts too", () => {
    expect(matchWake("Hey, you. New chat.", ["hey you"])).toMatchObject({ rest: "new chat", via: "learned" });
    expect(matchWake("Hey you", ["hey you"]).rest).toBe("");
    expect(matchWake("Hey, youth", ["hey you"]).rest).toBeUndefined();
  });
});

describe("learnedStart", () => {
  it("learns only what the defaults miss, and never a greeting alone or a sentence", () => {
    expect(learnedStart("Hey, you.")).toBe("hey you");
    expect(learnedStart("Age.")).toBe("age");
    expect(learnedStart("Hey Jig.")).toBeUndefined();
    expect(learnedStart("Hey, big.")).toBeUndefined();
    expect(learnedStart("Hey.")).toBeUndefined();
    expect(learnedStart("")).toBeUndefined();
    expect(learnedStart("I think it is something else")).toBeUndefined();
  });
});

describe("parseCommand", () => {
  it("knows the chat commands", () => {
    expect(id("new chat")).toBe("chat.new");
    expect(slots("open a new chat in the Shop project")).toEqual({ project: "shop" });
    expect(id("start a chat for contoso")).toBe("chat.new");
    expect(id("continue my last chat")).toBe("chat.continue");
    expect(id("talk mode")).toBe("chat.talk");
    expect(id("talk to this chat")).toBe("chat.talk");
    expect(slots("talk to the checkout chat")).toEqual({ chat: "checkout" });
    expect(slots("switch to Fabrikam")).toEqual({ project: "fabrikam" });
    expect(slots("add a task to the queue to fix the login page")).toEqual({ text: "fix the login page" });
    expect(slots("ask Claude why the build is slow")).toEqual({ text: "why the build is slow" });
  });
  it("knows the checking-in commands", () => {
    expect(id("What's happening?")).toBe("status.overview");
    expect(id("which chats are working")).toBe("status.overview");
    expect(id("read me the last answer")).toBe("status.lastAnswer");
    expect(id("what's in the queue")).toBe("status.tasks");
    expect(id("did the tests pass")).toBe("status.tests");
    expect(slots("how's the pipeline for shop")).toEqual({ repo: "shop" });
  });
  it("knows the running commands, and which need a yes", () => {
    expect(id("run the tests")).toBe("run.tests");
    expect(slots("run the tests in shop api")).toEqual({ repo: "shop api" });
    const deploy = parseCommand("deploy Shop to stage");
    expect(deploy?.command.id).toBe("run.deploy");
    expect(deploy?.command.confirm).toBe(true);
    expect(deploy?.slots).toEqual({ repo: "shop", env: "stage" });
    expect(id("pull the latest changes")).toBe("repo.pull");
    expect(slots("pull contoso")).toEqual({ repo: "contoso" });
    expect(id("fetch everything")).toBe("repo.fetch");
    expect(slots("run my morning workflow")).toEqual({ workflow: "morning" });
    expect(slots("start local")).toEqual({ script: "local" });
  });
  it("knows Jig's own commands, with polite padding", () => {
    expect(slots("save a note that the API moved to v2")).toEqual({ text: "the api moved to v2" });
    expect(id("could you please mute")).toBe("voice.mute");
    expect(id("say that again")).toBe("voice.repeat");
    expect(id("stop listening")).toBe("voice.sleep");
    expect(id("go to sleep")).toBe("voice.sleep");
    expect(id("what can I say")).toBe("voice.help");
  });
  it("leaves what it doesn't know", () => {
    expect(parseCommand("")).toBeUndefined();
    expect(parseCommand("make me a sandwich")).toBeUndefined();
  });
  it("has an example for every command that parses back to it", () => {
    for (const command of VOICE_COMMANDS)
      for (const say of command.say) {
        const example = say
          .replace(/<project>|<chat>|<repo>|<script>|<workflow>/g, "shop")
          .replace("<text>", "check the logs");
        expect(parseCommand(example)?.command.id, example).toBe(command.id);
      }
  });
});

describe("names", () => {
  it("cleans words", () => {
    expect(cleanWords("How’s the build?")).toBe("how is the build");
  });
  it("matches what was said to the closest real name", () => {
    const names = ["KnowiaStudio", "Shop", "shop-api", "Contoso"];
    expect(matchName("knowia studio", names, (n) => n)).toBe("KnowiaStudio");
    expect(matchName("shop api", names, (n) => n)).toBe("shop-api");
    expect(matchName("shop", names, (n) => n)).toBe("Shop");
    expect(matchName("contosso", names, (n) => n)).toBe("Contoso");
    expect(matchName("fabrikam", names, (n) => n)).toBeUndefined();
    expect(nameScore("", "Shop")).toBe(0);
  });
});
