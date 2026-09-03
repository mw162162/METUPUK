// tina/config.ts
import { defineConfig } from "tinacms";
var config_default = defineConfig({
  branch: process.env.TINA_BRANCH || "main",
  clientId: process.env.NEXT_PUBLIC_TINA_CLIENT_ID || null,
  token: process.env.TINA_TOKEN || null,
  build: {
    outputFolder: "admin",
    publicFolder: "dist"
  },
  media: {
    tina: {
      // Tina stores at <publicFolder>/<mediaRoot> and references
      // /<mediaRoot>/..., which is exactly where this site already keeps
      // its pictures — so no path rewriting is needed anywhere.
      mediaRoot: "media",
      publicFolder: "."
    }
  },
  schema: {
    collections: [
      {
        name: "pages",
        label: "Pages",
        path: "content/pages",
        format: "md",
        fields: [
          {
            type: "string",
            name: "title",
            label: "Title"
          },
          {
            type: "string",
            name: "excerpt",
            label: "Summary",
            description: "Shown under the heading and in search results. Leave empty to use the opening of the page.",
            ui: { component: "textarea" }
          },
          {
            type: "image",
            name: "image",
            label: "Banner image"
          },
          {
            type: "string",
            name: "imageAlt",
            label: "Banner alt text",
            description: "What the picture shows, for anyone who cannot see it."
          },
          {
            type: "object",
            name: "sections",
            label: "Sections",
            list: true,
            templates: [
              {
                name: "prose",
                label: "Text",
                fields: [
                  {
                    type: "string",
                    name: "body",
                    label: "Body",
                    ui: { component: "textarea" }
                  }
                ]
              },
              {
                name: "disclosure",
                label: "Expandable section",
                fields: [
                  {
                    type: "string",
                    name: "summary",
                    label: "Heading"
                  },
                  {
                    type: "string",
                    name: "body",
                    label: "Body",
                    ui: { component: "textarea" }
                  }
                ]
              },
              {
                name: "embed",
                label: "Embedded video or player",
                fields: [
                  {
                    type: "string",
                    name: "src",
                    label: "Address",
                    description: "The embed address, e.g. https://www.youtube.com/embed/XXXX"
                  },
                  {
                    type: "string",
                    name: "title",
                    label: "Title",
                    description: "What the video is, for anyone who cannot see it."
                  },
                  {
                    type: "string",
                    name: "variant",
                    label: "Kind",
                    options: ["video", "audio", "panel"]
                  },
                  {
                    type: "string",
                    name: "fallback",
                    label: "If the player cannot load",
                    description: "Shown in place of the player when a browser or network blocks it. Usually the track name and a direct link.",
                    ui: { component: "textarea" }
                  }
                ]
              },
              {
                name: "card",
                label: "Card",
                fields: [
                  {
                    type: "string",
                    name: "heading",
                    label: "Heading"
                  },
                  {
                    type: "image",
                    name: "image",
                    label: "Image"
                  },
                  {
                    type: "string",
                    name: "imageAlt",
                    label: "Alt text"
                  },
                  {
                    type: "string",
                    name: "href",
                    label: "Link"
                  },
                  {
                    type: "string",
                    name: "body",
                    label: "Body",
                    ui: { component: "textarea" }
                  }
                ]
              },
              {
                name: "gallery",
                label: "Picture grid",
                fields: [
                  {
                    type: "object",
                    name: "images",
                    label: "Pictures",
                    list: true,
                    fields: [
                      {
                        type: "image",
                        name: "src",
                        label: "Picture"
                      },
                      {
                        type: "string",
                        name: "alt",
                        label: "Describe this picture"
                      }
                    ]
                  }
                ]
              },
              {
                name: "profiles",
                label: "People",
                fields: [
                  {
                    type: "object",
                    name: "people",
                    label: "People",
                    list: true,
                    fields: [
                      {
                        type: "string",
                        name: "name",
                        label: "Name"
                      },
                      {
                        type: "string",
                        name: "role",
                        label: "Role"
                      },
                      {
                        type: "string",
                        name: "body",
                        label: "About",
                        ui: { component: "textarea" }
                      },
                      {
                        type: "object",
                        name: "links",
                        label: "Links",
                        list: true,
                        fields: [
                          {
                            type: "string",
                            name: "href",
                            label: "Address"
                          }
                        ]
                      }
                    ]
                  }
                ]
              },
              {
                name: "video",
                label: "Video file",
                fields: [
                  {
                    type: "image",
                    name: "src",
                    label: "Video file",
                    description: 'An MP4 you upload. For YouTube or Vimeo, use "Embedded video" instead.'
                  },
                  {
                    type: "image",
                    name: "captions",
                    label: "Captions file",
                    description: "A .vtt subtitle file. Without one this video is unusable for anyone deaf \u2014 please add it."
                  },
                  {
                    type: "image",
                    name: "poster",
                    label: "Still image",
                    description: "Shown before anyone presses play."
                  },
                  {
                    type: "string",
                    name: "caption",
                    label: "Caption"
                  }
                ]
              },
              {
                name: "buttons",
                label: "Buttons",
                fields: [
                  {
                    type: "object",
                    name: "buttons",
                    label: "Buttons",
                    list: true,
                    fields: [
                      {
                        type: "string",
                        name: "label",
                        label: "Text on the button"
                      },
                      {
                        type: "string",
                        name: "href",
                        label: "Link",
                        description: "A page on this site like /help-us/, or a full address like https://example.org"
                      },
                      {
                        type: "string",
                        name: "style",
                        label: "Style",
                        options: ["primary", "pink", "ghost"]
                      },
                      {
                        type: "boolean",
                        name: "newTab",
                        label: "Open in a new tab",
                        description: "Leave off for pages on this site. Turn on for somewhere else entirely."
                      }
                    ]
                  }
                ]
              },
              {
                name: "columns",
                label: "Columns",
                fields: [
                  {
                    type: "string",
                    name: "layout",
                    label: "Width",
                    description: "Columns stack into one on a phone whichever you choose.",
                    options: ["equal", "wide-left", "wide-right"]
                  },
                  {
                    type: "object",
                    name: "columns",
                    label: "Columns",
                    list: true,
                    fields: [
                      {
                        type: "string",
                        name: "body",
                        label: "Body",
                        ui: { component: "textarea" }
                      }
                    ]
                  }
                ]
              },
              {
                name: "image",
                label: "Image",
                fields: [
                  {
                    type: "image",
                    name: "src",
                    label: "Picture"
                  },
                  {
                    type: "string",
                    name: "alt",
                    label: "Describe this picture",
                    description: "What would you say to someone on the phone who cannot see it? A person\u2019s name, what is happening, what the graphic says."
                  },
                  {
                    type: "boolean",
                    name: "decorative",
                    label: "This picture is decorative",
                    description: "Tick only if the picture adds nothing a reader would miss. It will be hidden from screen readers. Leave unticked and write a description for every photograph of a person."
                  },
                  {
                    type: "string",
                    name: "caption",
                    label: "Caption"
                  },
                  {
                    type: "number",
                    name: "width",
                    label: "Width"
                  },
                  {
                    type: "number",
                    name: "height",
                    label: "Height"
                  }
                ]
              },
              {
                name: "quote",
                label: "Pull quote",
                fields: [
                  {
                    type: "string",
                    name: "text",
                    label: "Quote",
                    ui: { component: "textarea" }
                  },
                  {
                    type: "string",
                    name: "attribution",
                    label: "Attribution"
                  }
                ]
              },
              {
                name: "form",
                label: "Form",
                fields: [
                  {
                    type: "string",
                    name: "name",
                    label: "Form name",
                    description: "Shown with each message so you know which form it came from."
                  },
                  {
                    type: "string",
                    name: "intro",
                    label: "Intro",
                    ui: { component: "textarea" }
                  },
                  {
                    type: "object",
                    name: "fields",
                    label: "Questions",
                    list: true,
                    fields: [
                      {
                        type: "string",
                        name: "label",
                        label: "Label"
                      },
                      {
                        type: "string",
                        name: "name",
                        label: "Field name",
                        description: "Lowercase, no spaces. This is the heading it arrives under."
                      },
                      {
                        type: "string",
                        name: "type",
                        label: "Type",
                        options: ["text", "email", "tel", "textarea"]
                      },
                      {
                        type: "boolean",
                        name: "required",
                        label: "Required"
                      },
                      {
                        type: "string",
                        name: "help",
                        label: "Help text"
                      }
                    ]
                  },
                  {
                    type: "string",
                    name: "consent",
                    label: "Consent line",
                    description: "A tick box people must agree to before sending. Leave empty for none."
                  },
                  {
                    type: "string",
                    name: "success",
                    label: "Thank-you message",
                    description: "Shown in place of the form once it has sent."
                  },
                  {
                    type: "string",
                    name: "submit",
                    label: "Button text"
                  },
                  {
                    type: "string",
                    name: "action",
                    label: "Send submissions to",
                    description: "Leave as netlify unless you have your own endpoint."
                  }
                ]
              },
              {
                name: "html",
                label: "Custom HTML",
                fields: [
                  {
                    type: "string",
                    name: "html",
                    label: "HTML",
                    description: "An escape hatch. Anything here is published exactly as written.",
                    ui: { component: "textarea" }
                  }
                ]
              }
            ]
          },
          {
            type: "string",
            name: "url",
            label: "Web address",
            description: "Leave empty and we will build one from the title. Fill it in only to move a page \u2014 changing it breaks every existing link and any search result pointing at it."
          },
          {
            type: "string",
            name: "parent",
            label: "Sits under",
            description: "The last part of the address of the page above this one in the menu. Leave empty for a top-level page."
          },
          {
            type: "number",
            name: "order",
            label: "Order in the menu",
            description: "Lower numbers come first. Leave empty to sort by title."
          },
          {
            type: "datetime",
            name: "date",
            label: "First published"
          },
          {
            type: "datetime",
            name: "modified",
            label: "Last updated"
          }
        ]
      },
      {
        name: "posts",
        label: "News and blog",
        path: "content/posts",
        format: "md",
        fields: [
          {
            type: "string",
            name: "title",
            label: "Title"
          },
          {
            type: "string",
            name: "excerpt",
            label: "Summary",
            description: "Shown under the heading and in search results. Leave empty to use the opening of the post.",
            ui: { component: "textarea" }
          },
          {
            type: "image",
            name: "image",
            label: "Featured image"
          },
          {
            type: "string",
            name: "imageAlt",
            label: "Featured image alt text",
            description: "What the picture shows, for anyone who cannot see it."
          },
          {
            type: "object",
            name: "sections",
            label: "Sections",
            list: true,
            templates: [
              {
                name: "prose",
                label: "Text",
                fields: [
                  {
                    type: "string",
                    name: "body",
                    label: "Body",
                    ui: { component: "textarea" }
                  }
                ]
              },
              {
                name: "disclosure",
                label: "Expandable section",
                fields: [
                  {
                    type: "string",
                    name: "summary",
                    label: "Heading"
                  },
                  {
                    type: "string",
                    name: "body",
                    label: "Body",
                    ui: { component: "textarea" }
                  }
                ]
              },
              {
                name: "embed",
                label: "Embedded video or player",
                fields: [
                  {
                    type: "string",
                    name: "src",
                    label: "Address",
                    description: "The embed address, e.g. https://www.youtube.com/embed/XXXX"
                  },
                  {
                    type: "string",
                    name: "title",
                    label: "Title",
                    description: "What the video is, for anyone who cannot see it."
                  },
                  {
                    type: "string",
                    name: "variant",
                    label: "Kind",
                    options: ["video", "audio", "panel"]
                  },
                  {
                    type: "string",
                    name: "fallback",
                    label: "If the player cannot load",
                    description: "Shown in place of the player when a browser or network blocks it. Usually the track name and a direct link.",
                    ui: { component: "textarea" }
                  }
                ]
              },
              {
                name: "card",
                label: "Card",
                fields: [
                  {
                    type: "string",
                    name: "heading",
                    label: "Heading"
                  },
                  {
                    type: "image",
                    name: "image",
                    label: "Image"
                  },
                  {
                    type: "string",
                    name: "imageAlt",
                    label: "Alt text"
                  },
                  {
                    type: "string",
                    name: "href",
                    label: "Link"
                  },
                  {
                    type: "string",
                    name: "body",
                    label: "Body",
                    ui: { component: "textarea" }
                  }
                ]
              },
              {
                name: "gallery",
                label: "Picture grid",
                fields: [
                  {
                    type: "object",
                    name: "images",
                    label: "Pictures",
                    list: true,
                    fields: [
                      {
                        type: "image",
                        name: "src",
                        label: "Picture"
                      },
                      {
                        type: "string",
                        name: "alt",
                        label: "Describe this picture"
                      }
                    ]
                  }
                ]
              },
              {
                name: "profiles",
                label: "People",
                fields: [
                  {
                    type: "object",
                    name: "people",
                    label: "People",
                    list: true,
                    fields: [
                      {
                        type: "string",
                        name: "name",
                        label: "Name"
                      },
                      {
                        type: "string",
                        name: "role",
                        label: "Role"
                      },
                      {
                        type: "string",
                        name: "body",
                        label: "About",
                        ui: { component: "textarea" }
                      },
                      {
                        type: "object",
                        name: "links",
                        label: "Links",
                        list: true,
                        fields: [
                          {
                            type: "string",
                            name: "href",
                            label: "Address"
                          }
                        ]
                      }
                    ]
                  }
                ]
              },
              {
                name: "video",
                label: "Video file",
                fields: [
                  {
                    type: "image",
                    name: "src",
                    label: "Video file",
                    description: 'An MP4 you upload. For YouTube or Vimeo, use "Embedded video" instead.'
                  },
                  {
                    type: "image",
                    name: "captions",
                    label: "Captions file",
                    description: "A .vtt subtitle file. Without one this video is unusable for anyone deaf \u2014 please add it."
                  },
                  {
                    type: "image",
                    name: "poster",
                    label: "Still image",
                    description: "Shown before anyone presses play."
                  },
                  {
                    type: "string",
                    name: "caption",
                    label: "Caption"
                  }
                ]
              },
              {
                name: "buttons",
                label: "Buttons",
                fields: [
                  {
                    type: "object",
                    name: "buttons",
                    label: "Buttons",
                    list: true,
                    fields: [
                      {
                        type: "string",
                        name: "label",
                        label: "Text on the button"
                      },
                      {
                        type: "string",
                        name: "href",
                        label: "Link",
                        description: "A page on this site like /help-us/, or a full address like https://example.org"
                      },
                      {
                        type: "string",
                        name: "style",
                        label: "Style",
                        options: ["primary", "pink", "ghost"]
                      },
                      {
                        type: "boolean",
                        name: "newTab",
                        label: "Open in a new tab",
                        description: "Leave off for pages on this site. Turn on for somewhere else entirely."
                      }
                    ]
                  }
                ]
              },
              {
                name: "columns",
                label: "Columns",
                fields: [
                  {
                    type: "string",
                    name: "layout",
                    label: "Width",
                    description: "Columns stack into one on a phone whichever you choose.",
                    options: ["equal", "wide-left", "wide-right"]
                  },
                  {
                    type: "object",
                    name: "columns",
                    label: "Columns",
                    list: true,
                    fields: [
                      {
                        type: "string",
                        name: "body",
                        label: "Body",
                        ui: { component: "textarea" }
                      }
                    ]
                  }
                ]
              },
              {
                name: "image",
                label: "Image",
                fields: [
                  {
                    type: "image",
                    name: "src",
                    label: "Picture"
                  },
                  {
                    type: "string",
                    name: "alt",
                    label: "Describe this picture",
                    description: "What would you say to someone on the phone who cannot see it? A person\u2019s name, what is happening, what the graphic says."
                  },
                  {
                    type: "boolean",
                    name: "decorative",
                    label: "This picture is decorative",
                    description: "Tick only if the picture adds nothing a reader would miss. It will be hidden from screen readers. Leave unticked and write a description for every photograph of a person."
                  },
                  {
                    type: "string",
                    name: "caption",
                    label: "Caption"
                  },
                  {
                    type: "number",
                    name: "width",
                    label: "Width"
                  },
                  {
                    type: "number",
                    name: "height",
                    label: "Height"
                  }
                ]
              },
              {
                name: "quote",
                label: "Pull quote",
                fields: [
                  {
                    type: "string",
                    name: "text",
                    label: "Quote",
                    ui: { component: "textarea" }
                  },
                  {
                    type: "string",
                    name: "attribution",
                    label: "Attribution"
                  }
                ]
              },
              {
                name: "form",
                label: "Form",
                fields: [
                  {
                    type: "string",
                    name: "name",
                    label: "Form name",
                    description: "Shown with each message so you know which form it came from."
                  },
                  {
                    type: "string",
                    name: "intro",
                    label: "Intro",
                    ui: { component: "textarea" }
                  },
                  {
                    type: "object",
                    name: "fields",
                    label: "Questions",
                    list: true,
                    fields: [
                      {
                        type: "string",
                        name: "label",
                        label: "Label"
                      },
                      {
                        type: "string",
                        name: "name",
                        label: "Field name",
                        description: "Lowercase, no spaces. This is the heading it arrives under."
                      },
                      {
                        type: "string",
                        name: "type",
                        label: "Type",
                        options: ["text", "email", "tel", "textarea"]
                      },
                      {
                        type: "boolean",
                        name: "required",
                        label: "Required"
                      },
                      {
                        type: "string",
                        name: "help",
                        label: "Help text"
                      }
                    ]
                  },
                  {
                    type: "string",
                    name: "consent",
                    label: "Consent line",
                    description: "A tick box people must agree to before sending. Leave empty for none."
                  },
                  {
                    type: "string",
                    name: "success",
                    label: "Thank-you message",
                    description: "Shown in place of the form once it has sent."
                  },
                  {
                    type: "string",
                    name: "submit",
                    label: "Button text"
                  },
                  {
                    type: "string",
                    name: "action",
                    label: "Send submissions to",
                    description: "Leave as netlify unless you have your own endpoint."
                  }
                ]
              },
              {
                name: "html",
                label: "Custom HTML",
                fields: [
                  {
                    type: "string",
                    name: "html",
                    label: "HTML",
                    description: "An escape hatch. Anything here is published exactly as written.",
                    ui: { component: "textarea" }
                  }
                ]
              }
            ]
          },
          {
            type: "string",
            name: "url",
            label: "Web address",
            description: "Leave empty and we will build one from the date and the title. Changing it breaks every existing link to this post."
          },
          {
            type: "datetime",
            name: "date",
            label: "Published"
          },
          {
            type: "datetime",
            name: "modified",
            label: "Last updated"
          }
        ]
      }
    ]
  }
});
export {
  config_default as default
};
