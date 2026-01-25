export enum ItemType {
  Story = 0,
  Comment = 1,
  Job = 2,
  Poll = 3,
  PollOpt = 4,
  Unknown = 5,
}

export interface HNItem {
  id: number
  type: ItemType
  by: string | null
  time: number
  text: string | null
  url: string | null
  score: number
  title: string | null
  descendants: number
  kids: number[] | null
  parent: number | null
  dead: boolean
  deleted: boolean
}

export interface HNUser {
  id: string
  created: number
  karma: number
  about: string | null
  submitted: number[] | null
}

export type StoryFeed = 'top' | 'new' | 'best' | 'ask' | 'show' | 'jobs'
