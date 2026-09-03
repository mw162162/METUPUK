export function gql(strings, ...args) {
  let str = "";
  strings.forEach((string, i) => {
    str += string + (args[i] || "");
  });
  return str;
}
export const PagesPartsFragmentDoc = gql`
    fragment PagesParts on Pages {
  __typename
  title
  excerpt
  image
  imageAlt
  sections {
    __typename
    ... on PagesSectionsProse {
      body
    }
    ... on PagesSectionsDisclosure {
      summary
      body
    }
    ... on PagesSectionsEmbed {
      src
      title
      variant
      fallback
    }
    ... on PagesSectionsCard {
      heading
      image
      imageAlt
      href
      body
    }
    ... on PagesSectionsGallery {
      images {
        __typename
        src
        alt
      }
    }
    ... on PagesSectionsProfiles {
      people {
        __typename
        name
        role
        body
        links {
          __typename
          href
        }
      }
    }
    ... on PagesSectionsVideo {
      src
      captions
      poster
      caption
    }
    ... on PagesSectionsButtons {
      buttons {
        __typename
        label
        href
        style
        newTab
      }
    }
    ... on PagesSectionsColumns {
      layout
      columns {
        __typename
        body
      }
    }
    ... on PagesSectionsImage {
      src
      alt
      decorative
      caption
      width
      height
    }
    ... on PagesSectionsQuote {
      text
      attribution
    }
    ... on PagesSectionsForm {
      name
      intro
      fields {
        __typename
        label
        name
        type
        required
        help
      }
      consent
      success
      submit
      action
    }
    ... on PagesSectionsHtml {
      html
    }
  }
  url
  parent
  order
  date
  modified
}
    `;
export const PostsPartsFragmentDoc = gql`
    fragment PostsParts on Posts {
  __typename
  title
  excerpt
  image
  imageAlt
  sections {
    __typename
    ... on PostsSectionsProse {
      body
    }
    ... on PostsSectionsDisclosure {
      summary
      body
    }
    ... on PostsSectionsEmbed {
      src
      title
      variant
      fallback
    }
    ... on PostsSectionsCard {
      heading
      image
      imageAlt
      href
      body
    }
    ... on PostsSectionsGallery {
      images {
        __typename
        src
        alt
      }
    }
    ... on PostsSectionsProfiles {
      people {
        __typename
        name
        role
        body
        links {
          __typename
          href
        }
      }
    }
    ... on PostsSectionsVideo {
      src
      captions
      poster
      caption
    }
    ... on PostsSectionsButtons {
      buttons {
        __typename
        label
        href
        style
        newTab
      }
    }
    ... on PostsSectionsColumns {
      layout
      columns {
        __typename
        body
      }
    }
    ... on PostsSectionsImage {
      src
      alt
      decorative
      caption
      width
      height
    }
    ... on PostsSectionsQuote {
      text
      attribution
    }
    ... on PostsSectionsForm {
      name
      intro
      fields {
        __typename
        label
        name
        type
        required
        help
      }
      consent
      success
      submit
      action
    }
    ... on PostsSectionsHtml {
      html
    }
  }
  url
  date
  modified
}
    `;
export const PagesDocument = gql`
    query pages($relativePath: String!) {
  pages(relativePath: $relativePath) {
    ... on Document {
      _sys {
        filename
        basename
        hasReferences
        breadcrumbs
        path
        relativePath
        extension
      }
      id
    }
    ...PagesParts
  }
}
    ${PagesPartsFragmentDoc}`;
export const PagesConnectionDocument = gql`
    query pagesConnection($before: String, $after: String, $first: Float, $last: Float, $sort: String, $filter: PagesFilter) {
  pagesConnection(
    before: $before
    after: $after
    first: $first
    last: $last
    sort: $sort
    filter: $filter
  ) {
    pageInfo {
      hasPreviousPage
      hasNextPage
      startCursor
      endCursor
    }
    totalCount
    edges {
      cursor
      node {
        ... on Document {
          _sys {
            filename
            basename
            hasReferences
            breadcrumbs
            path
            relativePath
            extension
          }
          id
        }
        ...PagesParts
      }
    }
  }
}
    ${PagesPartsFragmentDoc}`;
export const PostsDocument = gql`
    query posts($relativePath: String!) {
  posts(relativePath: $relativePath) {
    ... on Document {
      _sys {
        filename
        basename
        hasReferences
        breadcrumbs
        path
        relativePath
        extension
      }
      id
    }
    ...PostsParts
  }
}
    ${PostsPartsFragmentDoc}`;
export const PostsConnectionDocument = gql`
    query postsConnection($before: String, $after: String, $first: Float, $last: Float, $sort: String, $filter: PostsFilter) {
  postsConnection(
    before: $before
    after: $after
    first: $first
    last: $last
    sort: $sort
    filter: $filter
  ) {
    pageInfo {
      hasPreviousPage
      hasNextPage
      startCursor
      endCursor
    }
    totalCount
    edges {
      cursor
      node {
        ... on Document {
          _sys {
            filename
            basename
            hasReferences
            breadcrumbs
            path
            relativePath
            extension
          }
          id
        }
        ...PostsParts
      }
    }
  }
}
    ${PostsPartsFragmentDoc}`;
export function getSdk(requester) {
  return {
    pages(variables, options) {
      return requester(PagesDocument, variables, options);
    },
    pagesConnection(variables, options) {
      return requester(PagesConnectionDocument, variables, options);
    },
    posts(variables, options) {
      return requester(PostsDocument, variables, options);
    },
    postsConnection(variables, options) {
      return requester(PostsConnectionDocument, variables, options);
    }
  };
}
import { createClient } from "tinacms/dist/client";
const generateRequester = (client) => {
  const requester = async (doc, vars, options) => {
    let url = client.apiUrl;
    if (options?.branch) {
      const index = client.apiUrl.lastIndexOf("/");
      url = client.apiUrl.substring(0, index + 1) + options.branch;
    }
    const data = await client.request({
      query: doc,
      variables: vars,
      url
    }, options);
    return { data: data?.data, errors: data?.errors, query: doc, variables: vars || {} };
  };
  return requester;
};
export const ExperimentalGetTinaClient = () => getSdk(
  generateRequester(
    createClient({
      url: "https://content.tinajs.io/2.4/content/beec4181-dd4a-41d1-a89f-6257a916f9b8/github/main",
      queries
    })
  )
);
export const queries = (client) => {
  const requester = generateRequester(client);
  return getSdk(requester);
};
