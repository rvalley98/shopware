import type { ComputedRef, Ref } from 'vue';
import { computed, isReactive, isReadonly, isRef, reactive, toRefs, watch } from 'vue';
import { syncRef } from '@vueuse/core';
import type { SetupContext, PublicProps } from '@vue/runtime-core';

/**
 * @experimental stableVersion:v6.7.0 feature:ADMIN_COMPOSITION_API_EXTENSION_SYSTEM
 * @package admin
 *
 * Extendable Setup Utility for Vue Components
 *
 * This file provides a utility for extending the setup function of Vue components
 * in a flexible and dynamic way. It allows for runtime modifications to
 * component behavior without directly altering the original component code.
 *
 * Key features:
 * 1. Dynamic Component Extension: Allows adding new functionality or overriding existing
 *    behavior of Vue components at runtime.
 * 2. Non-Invasive Modifications: Original components remain unchanged, with extensions
 *    applied through a wrapping mechanism.
 * 3. Reactive Overrides: Uses Vue's reactivity system to ensure that overrides are
 *    reactive and stay in sync with the component's state.
 * 4. Multiple Override Types: Supports various types of overrides including refs, computed
 *    properties, reactive objects, and functions.
 *
 * Main functions:
 * - extendableSetup: Wraps a component's setup function to make it extendable.
 * - overrideComponentSetup: Adds an override for a specific component.
 */

// Disable ESLint rules for this file due to the use of 'any' types and potentially unsafe operations
// eslint-disable-next-line max-len
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
declare global {
    /**
     * @experimental stableVersion:v6.7.0 feature:ADMIN_COMPOSITION_API_EXTENSION_SYSTEM
     *
     * This interface defines the public API mapping for each component that can be extended.
     * It will be used to get the correct types for the overrides and to ensure that the
     * overrides are compatible with the original component's public API.
     */
    interface ComponentPublicApiMapping {
        _internal_test_compponent: {
            baseValue: Ref<number, number>;
            multipliedValue: ComputedRef<number>;
            addedValue: ComputedRef<number>;
            title: Ref<string, string>;
        },
        // Fallback for untyped components
        [componentName: string]: { [key: string]: any };
    }
}

/**
 * @private
 * Create a reactive map to store overrides for each component
 */
export const _overridesMap: {
    // @ts-expect-error - previousState,props and context is any
    [componentName: string]: Array<(previousState, props, context) => any>
} = reactive({});

/**
 * @private
 * Function to check if the new structure contains at least all keys of the old structure (nested)
 */
const checkNestedStructure = ({
    oldObj,
    newObj,
    path = '',
    componentName,
}: {
    oldObj: Record<string, any>;
    newObj: Record<string, any>;
    path?: string;
    componentName: string;
}): {
    isValid: boolean;
    error: string | null;
} => {
    let result: {
        isValid: boolean;
        error: string | null;
    } = { isValid: true, error: null };

    // eslint-disable-next-line no-restricted-syntax
    for (const key of Object.keys(oldObj)) {
        const currentPath = path ? `${path}.${key}` : key;

        if (!Object.prototype.hasOwnProperty.call(newObj, key)) {
            result = {
                isValid: false,
                error: `[${componentName}] Override value not working. New structure does not contain key: ${currentPath}`,
            };
            break;
        }

        if (
            typeof oldObj[key] === 'object' && oldObj[key] !== null &&
            typeof newObj[key] === 'object' && newObj[key] !== null
        ) {
            // Recursively check nested objects
            const nestedResult = checkNestedStructure({
                oldObj: oldObj[key],
                newObj: newObj[key],
                path: currentPath,
                componentName,
            });

            if (!nestedResult.isValid) {
                result = nestedResult;
                break;
            }
        }
    }

    return result;
};

/**
 * This utility type is used to require the the exact shape of a type.
 */
type Exact<T, Shape> = T extends Shape
  ? Exclude<keyof T, keyof Shape> extends never
    ? T
    : never
  : never;

/**
 * @experimental stableVersion:v6.7.0 feature:ADMIN_COMPOSITION_API_EXTENSION_SYSTEM
 * Main function to extend the setup of a component
 */
// eslint-disable-next-line sw-deprecation-rules/private-feature-declarations
export function createExtendableSetup<
    PROPS extends { [key: string]: any },
    CONTEXT,
    COMPONENT_NAME extends keyof ComponentPublicApiMapping,
    SETUP_RESULT extends ComponentPublicApiMapping[COMPONENT_NAME]
>(
    options: {
        name: COMPONENT_NAME;
        props: PROPS;
        context: CONTEXT;
    },
    originalSetup: (
        props: PROPS,
        context: CONTEXT
    ) => Exact<SETUP_RESULT, ComponentPublicApiMapping[COMPONENT_NAME]>,
) {
    // Call the original setup function
    const originalSetupResult = originalSetup(
        options.props,
        options.context,
    );

    // Check if any prop value was returned from the original setup
    Object.keys(options.props).forEach((key) => {
        if (Object.keys(originalSetupResult).includes(key)) {
            // eslint-disable-next-line max-len
            console.error(`[${options.name}] The original setup function for the originalComponent component returned a prop. This is not allowed. Props are only available for overrides with the second argument.`);

            // Delete the prop values from the original setup result
            delete originalSetupResult[key];
        }
    });

    // Initialize the overrides array for this component if it doesn't exist
    if (!_overridesMap[options.name]) {
        _overridesMap[options.name] = reactive([]);
    }

    const overrides = _overridesMap[options.name];

    // Create a reactive wrapper for the original setup result
    const wrappedState = originalSetupResult;
    const reactiveWrappedState = reactive(wrappedState);

    // Keep track of applied overrides to avoid duplicates
    const appliedOverrides = reactive<any>([]);

    // Function to apply overrides
    const applyOverrides = () => {
        overrides.forEach((override) => {
            // Skip if this override has already been applied
            if (appliedOverrides.includes(override)) {
                return;
            }

            // Apply the override with a destructured copy of the wrapped state to prevent calling himself
            const overrideResult = override({ ...wrappedState }, options.props, options.context);

            // Process each property in the override result
            Object.keys(overrideResult).forEach((key) => {
                // Skip if the key is a prop, as props should not be overridden
                if (Object.keys(options.props).includes(key)) {
                    // eslint-disable-next-line max-len
                    console.error(`[${options.name}] Override result value not working. Cannot override props. Following prop should be changed: "${key}"`);
                    return;
                }
                const resultValue = overrideResult[key];

                // @ts-expect-error - "effect" is not part of the Ref type
                if (!isReadonly(resultValue) && isRef(resultValue) && !resultValue?.effect) {
                    // Handle normal ref values with 2-Way sync
                    syncRef(resultValue, wrappedState[key]);
                } else if (isReadonly(resultValue) && isRef(resultValue)) {
                    // Handle readonly computed values
                    reactiveWrappedState[key] = resultValue;
                    // @ts-expect-error - "effect" is part of a writable computed value
                } else if (!isReadonly(resultValue) && isRef(resultValue) && resultValue?.effect) {
                    // Handle writable computed values, create a new computed property with getter and setter
                    reactiveWrappedState[key] = computed({
                        get: () => resultValue.value,
                        set: (value) => {
                            resultValue.value = value;
                        },
                    });
                } else if (isReactive(resultValue)) {
                    // Check if new structure contains at least all keys of the old structure (nested)
                    const validationResult = checkNestedStructure({
                        oldObj: reactiveWrappedState[key],
                        newObj: resultValue,
                        componentName: options.name as string,
                        path: key,
                    });

                    if (!validationResult.isValid) {
                        console.error(validationResult.error);
                        return;
                    }

                    // Assign reactive objects directly
                    Object.assign(reactiveWrappedState[key], resultValue);
                } else if (typeof resultValue === 'function') {
                    // Handle functions, assign directly
                    reactiveWrappedState[key] = resultValue;
                } else {
                    // Log an error for unhandled types
                    // eslint-disable-next-line max-len
                    console.error(`[${options.name}] Override value not working. No handling declared for:`, key, resultValue);
                }
            });

            // Mark this override as applied
            appliedOverrides.push(override);
        });
    };

    // Watch for changes in the overrides array and reapply overrides when changed
    watch(overrides, applyOverrides, { deep: true, immediate: true });

    return toRefs(reactiveWrappedState) as ComponentPublicApiMapping[COMPONENT_NAME];
}

/**
 * Types for extracting the props of a component
 */
type InferComponentProps<T> = T extends new () => { $props: infer P } ? P : never
type ExtractedProps<T> = Omit<{
    [key in keyof InferComponentProps<T>]: InferComponentProps<T>[key];
}, keyof PublicProps>;

/**
 * @experimental stableVersion:v6.7.0 feature:ADMIN_COMPOSITION_API_EXTENSION_SYSTEM
 * Function to add an override for a specific component
 */
// eslint-disable-next-line sw-deprecation-rules/private-feature-declarations
export function overrideComponentSetup<ORIGINAL_COMPONENT>() {
    return function <
        COMPONENT_NAME extends keyof ComponentPublicApiMapping
    > (
        componentName: COMPONENT_NAME,
        override: (
            previousState: ComponentPublicApiMapping[COMPONENT_NAME],
            props: ExtractedProps<ORIGINAL_COMPONENT>,
            context: SetupContext,
        ) => any,
    ): void {
        // Initialize the overrides array for this component if it doesn't exist
        if (!_overridesMap[componentName]) {
            _overridesMap[componentName] = reactive([]);
        }

        // Add the new override to the array
        _overridesMap[componentName].push(override);
    };
}
