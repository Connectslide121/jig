import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "./Markdown";

describe("Markdown HTML file previews", () => {
  it("renders safe README HTML, preserving local image paths and sizes", () => {
    const html = renderToStaticMarkup(
      <Markdown
        allowHtml
        baseUrl="jig-file://grant/docs/"
        text={'<p align="center"><img src="img/logo.png?v=2" width="112" alt="Shop"></p>\n\n<h1>Shop</h1>'}
      />,
    );
    expect(html).toContain('<p align="center">');
    expect(html).toContain('src="jig-file://grant/docs/img/logo.png?v=2"');
    expect(html).toContain('width="112"');
    expect(html).toContain("<h1>Shop</h1>");
  });
  it("removes scripts, event handlers, unsafe URLs and embedded frames", () => {
    const html = renderToStaticMarkup(
      <Markdown
        allowHtml
        text={
          '<script>window.attacked = true</script><iframe src="https://example.com"></iframe><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">link</a>'
        }
      />,
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("window.attacked");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<iframe");
  });
  it("continues escaping HTML in chats", () => {
    expect(renderToStaticMarkup(<Markdown text="<b>literal</b>" />)).toContain("&lt;b&gt;literal&lt;/b&gt;");
  });
});

describe("Markdown tables", () => {
  it("preserves sanitized HTML cell spans, widths and alignment", () => {
    const html = renderToStaticMarkup(
      <Markdown
        allowHtml
        text={
          '<table><tr><td colspan="2" valign="top">Banner</td></tr><tr><td width="50%" rowspan="2">Left</td><td align="right">Right</td></tr><tr><td>Last</td></tr></table>'
        }
      />,
    );
    expect(html).toContain('colSpan="2"');
    expect(html).toContain('rowSpan="2"');
    expect(html).toContain('width="50%"');
    expect(html).toContain('valign="top"');
    expect(html).toContain("text-align:right");
  });
  it("retains GFM table alignment", () => {
    const html = renderToStaticMarkup(
      <Markdown text={"| Left | Center | Right |\n| :--- | :---: | ---: |\n| One | Two | 3 |"} />,
    );
    expect(html).toContain("<table");
    expect(html).toContain("text-align:center");
    expect(html).toContain("text-align:right");
  });
});
