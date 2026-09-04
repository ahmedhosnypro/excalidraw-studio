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

export interface CommentReactionGql {
  emoji: string;
  count: number;
  mine: boolean;
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
  reactions: CommentReactionGql[];
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
      reactions {
        emoji
        count
        mine
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
  reactions {
    emoji
    count
    mine
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
// Comment reactions
// ---------------------------------------------------------------------------

export const TOGGLE_COMMENT_REACTION_MUTATION = gql`
  mutation ToggleCommentReaction($id: ID!, $emoji: String!) {
    toggleCommentReaction(id: $id, emoji: $emoji) {
      ${COMMENT_FIELDS}
    }
  }
`;

export interface ToggleReactionMutationData {
  toggleCommentReaction: CommentGql;
}

export interface ToggleReactionMutationVariables {
  id: string;
  emoji: string;
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
  query SharedComments($token: String!, $viewerGuestName: String) {
    sharedComments(token: $token, viewerGuestName: $viewerGuestName) {
      ${COMMENT_FIELDS}
    }
  }
`;

export interface SharedCommentsQueryData {
  sharedComments: CommentGql[];
}

export interface SharedCommentsQueryVariables {
  token: string;
  viewerGuestName?: string;
}

export const TOGGLE_GUEST_REACTION_MUTATION = gql`
  mutation ToggleGuestCommentReaction(
    $token: String!
    $guestName: String!
    $id: ID!
    $emoji: String!
  ) {
    toggleGuestCommentReaction(token: $token, guestName: $guestName, id: $id, emoji: $emoji) {
      ${COMMENT_FIELDS}
    }
  }
`;

export interface ToggleGuestReactionMutationData {
  toggleGuestCommentReaction: CommentGql;
}

export interface ToggleGuestReactionMutationVariables {
  token: string;
  guestName: string;
  id: string;
  emoji: string;
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

// ---------------------------------------------------------------------------
// Version history (scene snapshots)
// ---------------------------------------------------------------------------

interface SceneSnapshotGql {
  id: string;
  fileId: string;
  label: string | null;
  elementCount: number;
  createdAt: string;
}

export const SCENE_SNAPSHOTS_QUERY = gql`
  query SceneSnapshots($fileId: ID!) {
    sceneSnapshots(fileId: $fileId) {
      id
      fileId
      label
      elementCount
      createdAt
    }
  }
`;

export interface SceneSnapshotsQueryData {
  sceneSnapshots: SceneSnapshotGql[];
}

export interface SceneSnapshotsQueryVariables {
  fileId: string;
}

export const SCENE_SNAPSHOT_QUERY = gql`
  query SceneSnapshotContent($id: ID!) {
    sceneSnapshot(id: $id) {
      elements
      appState
      files
    }
  }
`;

export interface SceneSnapshotQueryData {
  sceneSnapshot: SceneDataGql;
}

export interface SceneSnapshotQueryVariables {
  id: string;
}

export const CREATE_SCENE_SNAPSHOT_MUTATION = gql`
  mutation CreateSceneSnapshot($fileId: ID!, $label: String) {
    createSceneSnapshot(fileId: $fileId, label: $label) {
      id
      fileId
      label
      elementCount
      createdAt
    }
  }
`;

export const RESTORE_SCENE_SNAPSHOT_MUTATION = gql`
  mutation RestoreSceneSnapshot($id: ID!) {
    restoreSceneSnapshot(id: $id) {
      ${FILE_FIELDS}
    }
  }
`;

export const DELETE_SCENE_SNAPSHOT_MUTATION = gql`
  mutation DeleteSceneSnapshot($id: ID!) {
    deleteSceneSnapshot(id: $id)
  }
`;

export interface SnapshotMutationData {
  createSceneSnapshot?: SceneSnapshotGql;
  restoreSceneSnapshot?: FileGql;
  deleteSceneSnapshot?: boolean;
}

export interface SnapshotMutationVariables {
  fileId?: string;
  id?: string;
  label?: string | null;
}

// ---------------------------------------------------------------------------
// AI text-to-diagram
// ---------------------------------------------------------------------------

export const GENERATE_DIAGRAM_MUTATION = gql`
  mutation GenerateDiagram($prompt: String!) {
    generateDiagram(prompt: $prompt) {
      elements
      elementCount
    }
  }
`;

export interface GenerateDiagramMutationData {
  generateDiagram?: {
    elements: Record<string, unknown>[];
    elementCount: number;
  };
}

export interface GenerateDiagramMutationVariables {
  prompt: string;
}

// ---------------------------------------------------------------------------
// AI improve-selection
// ---------------------------------------------------------------------------

export const IMPROVE_DIAGRAM_MUTATION = gql`
  mutation ImproveDiagram($prompt: String!, $elements: [JSON!]!) {
    improveDiagram(prompt: $prompt, elements: $elements) {
      elements
      elementCount
    }
  }
`;

export interface ImproveDiagramMutationData {
  improveDiagram?: {
    elements: Record<string, unknown>[];
    elementCount: number;
  };
}

export interface ImproveDiagramMutationVariables {
  prompt: string;
  elements: Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Personal library (account sync — excalidraw+ paid parity)
// ---------------------------------------------------------------------------

export interface LibraryItemGql {
  id: string;
  status: string;
  created: string;
  name: string | null;
  elements: Record<string, unknown>[];
}

interface LibraryGql {
  items: LibraryItemGql[];
  updatedAt: string | null;
}

export const LIBRARY_QUERY = gql`
  query Library {
    library {
      updatedAt
      items {
        id
        status
        created
        name
        elements
      }
    }
  }
`;

export interface LibraryQueryData {
  library: LibraryGql;
}

export const SAVE_LIBRARY_MUTATION = gql`
  mutation SaveLibrary($items: [JSON!]!) {
    saveLibrary(items: $items) {
      updatedAt
      items {
        id
        status
        created
        name
        elements
      }
    }
  }
`;
