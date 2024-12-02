export interface IRuleItem {
  /**
   * id of the rule, auto increment
   */
  id: number
  /**
   * timestamp of when rule been created
   * * will be used as the id of the rule
   */
  createdAt: number
  /**
   * domain of the rule, calculated from origin
   */
  domain: string
  /**
   * origin of the rule
   */
  origin: string
  /**
   * user comment of the rule
   */
  comment?: string
  /**
   * whether the rule is disabled, the rule is enabled by default
   */
  disabled?: boolean
  /**
   * timestamp of when rule been updated
   */
  updatedAt: number
}
