import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Appraise | Locator Picker',
  description: 'Opens the locator workspace to pick or create locators.',
}

const LocatorPickerPage = () => {
  redirect('/locators/create')
}

export default LocatorPickerPage
