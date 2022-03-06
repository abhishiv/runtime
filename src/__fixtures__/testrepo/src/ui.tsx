import React from 'react'
const b1: string[] = []
const a: React.RefObject<string> = 5
const a2: number | React.RefObject<string> = 5
a2
export type BB = React.RefObject<string>
export interface PageProps {
  name: string
  b?: B
  c: React.RefObject<string>
}
const b: React.RefObject<string> = { name: '' }
export interface B {
  a: React.RefObject<string>
}
export function Page(props: PageProps) {
  return <div>hey, {props.name}</div>
}

export function getParent<T>(items: T[], node: T): T | null {
  return null
}
export function getChildren<T>(items: T[], node: T) {}
