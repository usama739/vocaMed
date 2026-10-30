<?php

namespace Tests\Concerns;

/**
 * Checks that what a read model returns has the same shape as the example the screens are tested with
 * (tests/fixtures/*.json): the same keys and the same kinds of value, recursively. Values themselves may differ. A
 * list is compared by its first item when both have one.
 */
trait AssertsShape
{
    /**
     * @return array<string, mixed>
     */
    protected function fixture(string $name): array
    {
        $json = file_get_contents(base_path("tests/fixtures/$name.json"));

        return json_decode((string) $json, true, 512, JSON_THROW_ON_ERROR);
    }

    protected function assertSameShape(mixed $expected, mixed $actual, string $path = '$'): void
    {
        if (is_array($expected) && array_is_list($expected)) {
            $this->assertIsArray($actual, "$path should be a list");
            $this->assertTrue(array_is_list($actual), "$path should be a list");

            if ($expected !== [] && $actual !== []) {
                $this->assertSameShape($expected[0], $actual[0], "$path[0]");
            }

            return;
        }

        if (is_array($expected)) {
            $this->assertIsArray($actual, "$path should be an object");
            $this->assertEqualsCanonicalizing(array_keys($expected), array_keys($actual), "$path has different keys");

            foreach ($expected as $key => $value) {
                $this->assertSameShape($value, $actual[$key], "$path.$key");
            }

            return;
        }

        $kind = fn (mixed $v): string => get_debug_type($v);

        // A nullable value in the example (null) accepts any kind; otherwise the kind must match.
        if ($expected !== null) {
            $this->assertSame($kind($expected), $kind($actual), "$path has the wrong kind of value");
        }
    }
}
