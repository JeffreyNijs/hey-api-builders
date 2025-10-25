/**
 * Represents the options for the builder.
 */
export type BuilderOptions = {
  useDefault?: boolean
  useExamples?: boolean
  alwaysIncludeOptionals?: boolean
  optionalsProbability?: number
  omitNulls?: boolean
}

/**
 * The base class for all builders.
 * It provides the basic functionality for setting options and building the mock data.
 */
export abstract class BaseBuilder<T> {
  protected overrides: Partial<T> = {}
  protected options: BuilderOptions = {}

  /**
   * Sets the options for the builder.
   * @param o The options to set.
   * @returns The builder instance.
   */
  setOptions(o: BuilderOptions): this {
    this.options = o
    return this
  }

  /**
   * Builds the mock data.
   * This method must be implemented by the subclasses.
   */
  abstract build(): T
}
