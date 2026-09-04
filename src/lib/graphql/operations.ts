import { gql } from "@apollo/client";

// ---------------------------------------------------------------------------
// Types (hand-written to match the server schema)
// ---------------------------------------------------------------------------

export interface UserGql {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface FileGql {
  id: string;
  userId?: string;
  name: string;
  shareToken?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface SceneDataGql {
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

interface CommentAuthorGql {
  id: string;
  name: string;
  isGuest?: boolean;
}

export interface CommentGql {
  id: string;
  fileId: string;
  body: string;
  parentId: string | null;
  x: number | null;
  y: number | null;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
  author: CommentAuthorGql | null;
}

export interface SceneDataInput {
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const ME_QUERY = gql`
  query Me {
    me {
      id
      email
      name
      createdAt
    }
  }
`;

export interface MeQueryData {
  me: UserGql | null;
}

export const FILES_QUERY = gql`
  query Files {
    files(orderBy: { updatedAt: { direction: desc, priority: 1 } }) {
      id
      name
      shareToken
      createdAt
      updatedAt
    }
  }
`;

export interface FilesQueryData {
  files: FileGql[];
}

export const SCENE_QUERY = gql`
  query Scene($fileId: ID!) {
    scene(fileId: $fileId) {
      elements
      appState
      files
    }
  }
`;

export interface SceneQueryData {
  scene: SceneDataGql | null;
}

export interface SceneQueryVariables {
  fileId: string;
}

export const COMMENTS_QUERY = gql`
  query Comments($fileId: ID!) {
    comments(fileId: $fileId) {
      id
      fileId
      body
      parentId
      x
      y
      resolved
      createdAt
      updatedAt
      author {
        id
        name
        isGuest
      }
    }
  }
`;

export interface CommentsQueryData {
  comments: CommentGql[];
}

export interface CommentsQueryVariables {
  fileId: string;
}

// ---------------------------------------------------------------------------
// Auth mutations
// ---------------------------------------------------------------------------

export const SIGNUP_MUTATION = gql`
  mutation Signup($email: String!, $password: String!, $name: String!) {
    signup(email: $email, password: $password, name: $name) {
      id
      email
      name
      createdAt
    }
  }
`;

export const LOGIN_MUTATION = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      id
      email
      name
      createdAt
    }
  }
`;

export const LOGOUT_MUTATION = gql`
  mutation Logout {
    logout
  }
`;

export interface AuthMutationData {
  signup?: UserGql;
  login?: UserGql;
}

export interface AuthMutationVariables {
  email: string;
  password: string;
  name?: string;
}

// ---------------------------------------------------------------------------
// File mutations
// ---------------------------------------------------------------------------

const FILE_FIELDS = `
  id
  userId
  name
  shareToken
  createdAt
  updatedAt
`;

export const CREATE_FILE_MUTATION = gql`
  mutation CreateFile($name: String!) {
    createFile(name: $name) {
      ${FILE_FIELDS}
    }
  }
`;

export const RENAME_FILE_MUTATION = gql`
  mutation RenameFile($id: ID!, $name: String!) {
    renameFile(id: $id, name: $name) {
      ${FILE_FIELDS}
    }
  }
`;

export const DELETE_FILE_MUTATION = gql`
  mutation DeleteFile($id: ID!) {
    deleteFile(id: $id)
  }
`;

export const DUPLICATE_FILE_MUTATION = gql`
  mutation DuplicateFile($id: ID!) {
    duplicateFile(id: $id) {
      ${FILE_FIELDS}
    }
  }
`;

export const SAVE_SCENE_MUTATION = gql`
  mutation SaveScene($fileId: ID!, $data: SceneDataInput!) {
    saveScene(fileId: $fileId, data: $data) {
      id
      name
      updatedAt
    }
  }
`;

export const MIGRATE_GUEST_SCENE_MUTATION = gql`
  mutation MigrateGuestScene($name: String, $data: SceneDataInput!) {
    migrateGuestScene(name: $name, data: $data) {
      ${FILE_FIELDS}
    }
  }
`;

export interface FileMutationData {
  createFile?: FileGql;
  renameFile?: FileGql;
  duplicateFile?: FileGql;
  saveScene?: FileGql;
  migrateGuestScene?: FileGql;
}

export interface FileMutationVariables {
  id?: string;
  fileId?: string;
  name?: string;
  data?: SceneDataInput;
}

// ---------------------------------------------------------------------------
// Comment mutations
// ---------------------------------------------------------------------------

const COMMENT_FIELDS = `
  id
  fileId
  body
  parentId
  x
  y
  resolved
  createdAt
  updatedAt
  author {
    id
    name
    isGuest
  }
`;

export const ADD_COMMENT_MUTATION = gql`
  mutation AddComment($fileId: ID!, $body: String!, $parentId: ID, $x: Float, $y: Float) {
    addComment(fileId: $fileId, body: $body, parentId: $parentId, x: $x, y: $y) {
      ${COMMENT_FIELDS}
    }
  }
`;

export const UPDATE_COMMENT_MUTATION = gql`
  mutation UpdateComment($id: ID!, $body: String!) {
    updateComment(id: $id, body: $body) {
      ${COMMENT_FIELDS}
    }
  }
`;

export const RESOLVE_COMMENT_MUTATION = gql`
  mutation ResolveComment($id: ID!, $resolved: Boolean!) {
    resolveComment(id: $id, resolved: $resolved) {
      ${COMMENT_FIELDS}
    }
  }
`;

export const DELETE_COMMENT_MUTATION = gql`
  mutation DeleteComment($id: ID!) {
    deleteComment(id: $id)
  }
`;

export interface CommentMutationData {
  addComment?: CommentGql;
  updateComment?: CommentGql;
  resolveComment?: CommentGql;
}

export interface CommentMutationVariables {
  id?: string;
  fileId?: string;
  body?: string;
  parentId?: string | null;
  x?: number | null;
  y?: number | null;
  resolved?: boolean;
}

// ---------------------------------------------------------------------------
// Share links + guest access (public, token-scoped)
// ---------------------------------------------------------------------------

export const CREATE_SHARE_LINK_MUTATION = gql`
  mutation CreateShareLink($fileId: ID!) {
    createShareLink(fileId: $fileId) {
      ${FILE_FIELDS}
    }
  }
`;

export const REVOKE_SHARE_LINK_MUTATION = gql`
  mutation RevokeShareLink($fileId: ID!) {
    revokeShareLink(fileId: $fileId) {
      ${FILE_FIELDS}
    }
  }
`;

export interface ShareLinkMutationData {
  createShareLink?: FileGql;
  revokeShareLink?: FileGql;
}

export interface ShareLinkMutationVariables {
  fileId: string;
}

interface SharedFileGql {
  id: string;
  name: string;
  ownerName: string;
  updatedAt: string;
}

export const SHARED_FILE_QUERY = gql`
  query SharedFile($token: String!) {
    sharedFile(token: $token) {
      id
      name
      ownerName
      updatedAt
    }
  }
`;

export interface SharedFileQueryData {
  sharedFile: SharedFileGql;
}

export interface SharedFileQueryVariables {
  token: string;
}

export const SHARED_SCENE_QUERY = gql`
  query SharedScene($token: String!) {
    sharedScene(token: $token) {
      elements
      appState
      files
    }
  }
`;

export interface SharedSceneQueryData {
  sharedScene: SceneDataGql;
}

export interface SharedSceneQueryVariables {
  token: string;
}

export const SHARED_COMMENTS_QUERY = gql`
  query SharedComments($token: String!) {
    sharedComments(token: $token) {
      ${COMMENT_FIELDS}
    }
  }
`;

export interface SharedCommentsQueryData {
  sharedComments: CommentGql[];
}

export interface SharedCommentsQueryVariables {
  token: string;
}

export const ADD_GUEST_COMMENT_MUTATION = gql`
  mutation AddGuestComment(
    $token: String!
    $guestName: String!
    $body: String!
    $parentId: ID
    $x: Float
    $y: Float
  ) {
    addGuestComment(
      token: $token
      guestName: $guestName
      body: $body
      parentId: $parentId
      x: $x
      y: $y
    ) {
      ${COMMENT_FIELDS}
    }
  }
`;

export interface GuestCommentMutationData {
  addGuestComment: CommentGql;
}

export interface GuestCommentMutationVariables {
  token: string;
  guestName: string;
  body: string;
  parentId?: string | null;
  x?: number | null;
  y?: number | null;
}

// ---------------------------------------------------------------------------
// Storage usage
// ---------------------------------------------------------------------------

interface StorageUsageGql {
  bytes: number;
  fileCount: number;
}

export const STORAGE_USAGE_QUERY = gql`
  query StorageUsage {
    storageUsage {
      bytes
      fileCount
    }
  }
`;

export interface StorageUsageQueryData {
  storageUsage: StorageUsageGql;
}
